use anchor_lang::prelude::*;

declare_id!("xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv");

#[program]
pub mod xenblocks_airdrop_tracker {
    use super::*;

    /// Initialize the global state (one-time setup)
    pub fn initialize_state(ctx: Context<InitializeState>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.run_counter = 0;
        state.bump = ctx.bumps.state;
        msg!("Initialized global state");
        Ok(())
    }

    /// Create a new airdrop run (V2 with per-token totals)
    pub fn create_run_v2(ctx: Context<CreateRunV2>, dry_run: bool) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let run = &mut ctx.accounts.airdrop_run;

        state.run_counter += 1;

        run.version = 1;
        run.run_id = state.run_counter;
        run.run_date = Clock::get()?.unix_timestamp;
        run.total_recipients = 0;
        run.total_amount = 0;
        run.total_xnm_amount = 0;
        run.total_xblk_amount = 0;
        run.total_xuni_amount = 0;
        run.total_native_amount = 0;
        run.dry_run = dry_run;
        run.reserved = [0u64; 4];
        run.bump = ctx.bumps.airdrop_run;

        msg!("Created airdrop run v2 #{}", run.run_id);
        Ok(())
    }

    /// Update run totals after completion (V2 with per-token amounts)
    pub fn update_run_totals_v2(
        ctx: Context<UpdateRunTotalsV2>,
        total_recipients: u32,
        total_amount: u64,
        total_xnm_amount: u64,
        total_xblk_amount: u64,
        total_xuni_amount: u64,
        total_native_amount: u64,
    ) -> Result<()> {
        let run = &mut ctx.accounts.airdrop_run;
        run.total_recipients = total_recipients;
        run.total_amount = total_amount;
        run.total_xnm_amount = total_xnm_amount;
        run.total_xblk_amount = total_xblk_amount;
        run.total_xuni_amount = total_xuni_amount;
        run.total_native_amount = total_native_amount;

        msg!(
            "Updated run v2 #{}: recipients={}, total={}, xnm={}, xblk={}, xuni={}, native={}",
            run.run_id,
            total_recipients,
            total_amount,
            total_xnm_amount,
            total_xblk_amount,
            total_xuni_amount,
            total_native_amount
        );
        Ok(())
    }

    /// Initialize a new airdrop record keyed by ETH address
    pub fn initialize_record_v2(
        ctx: Context<InitializeRecordV2>,
        eth_address: [u8; 42],
    ) -> Result<()> {
        let record = &mut ctx.accounts.airdrop_record;
        record.eth_address = eth_address;
        record.xnm_airdropped = 0;
        record.xblk_airdropped = 0;
        record.xuni_airdropped = 0;
        record.native_airdropped = 0;
        record.reserved = [0u64; 4];
        record.last_updated = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.airdrop_record;

        msg!("Initialized V2 airdrop record for eth: {:?}", &eth_address[..6]);
        Ok(())
    }

    /// Update an existing airdrop record after a successful transfer
    pub fn update_record_v2(
        ctx: Context<UpdateRecordV2>,
        xnm_amount: u64,
        xblk_amount: u64,
        xuni_amount: u64,
        native_amount: u64,
    ) -> Result<()> {
        let record = &mut ctx.accounts.airdrop_record;

        record.xnm_airdropped = record
            .xnm_airdropped
            .checked_add(xnm_amount)
            .ok_or(ErrorCode::Overflow)?;
        record.xblk_airdropped = record
            .xblk_airdropped
            .checked_add(xblk_amount)
            .ok_or(ErrorCode::Overflow)?;
        record.xuni_airdropped = record
            .xuni_airdropped
            .checked_add(xuni_amount)
            .ok_or(ErrorCode::Overflow)?;
        record.native_airdropped = record
            .native_airdropped
            .checked_add(native_amount)
            .ok_or(ErrorCode::Overflow)?;

        record.last_updated = Clock::get()?.unix_timestamp;

        msg!(
            "Updated V2 airdrop record: xnm={}, xblk={}, xuni={}, native={}",
            xnm_amount,
            xblk_amount,
            xuni_amount,
            native_amount
        );
        Ok(())
    }

    /// Initialize a record and immediately set amounts (for new wallets during airdrop)
    pub fn initialize_and_update_v2(
        ctx: Context<InitializeRecordV2>,
        eth_address: [u8; 42],
        xnm_amount: u64,
        xblk_amount: u64,
        xuni_amount: u64,
        native_amount: u64,
    ) -> Result<()> {
        let record = &mut ctx.accounts.airdrop_record;
        record.eth_address = eth_address;
        record.xnm_airdropped = xnm_amount;
        record.xblk_airdropped = xblk_amount;
        record.xuni_airdropped = xuni_amount;
        record.native_airdropped = native_amount;
        record.reserved = [0u64; 4];
        record.last_updated = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.airdrop_record;

        msg!(
            "Initialized and updated V2 airdrop record: xnm={}, xblk={}, xuni={}, native={}",
            xnm_amount,
            xblk_amount,
            xuni_amount,
            native_amount
        );
        Ok(())
    }

    /// Close an airdrop record and reclaim rent (admin only)
    pub fn close_record_v2(_ctx: Context<CloseRecordV2>) -> Result<()> {
        msg!("Closed airdrop record and reclaimed rent");
        Ok(())
    }

    /// Transfer authority to a new public key (current authority only)
    pub fn update_authority(ctx: Context<UpdateAuthority>, new_authority: Pubkey) -> Result<()> {
        let state = &mut ctx.accounts.state;
        msg!("Authority updated from {} to {}", state.authority, new_authority);
        state.authority = new_authority;
        Ok(())
    }

    /// Initialize the airdrop lock PDA (one-time setup)
    pub fn initialize_lock(ctx: Context<InitializeLock>) -> Result<()> {
        let lock = &mut ctx.accounts.lock;
        lock.lock_holder = Pubkey::default();
        lock.locked_at = 0;
        lock.timeout_seconds = 0;
        lock.run_id = 0;
        lock.bump = ctx.bumps.lock;
        msg!("Initialized airdrop lock");
        Ok(())
    }

    /// Acquire the airdrop lock (or override if expired)
    pub fn acquire_lock(ctx: Context<AcquireLock>, timeout_seconds: i64) -> Result<()> {
        require!(
            (60..=3600).contains(&timeout_seconds),
            ErrorCode::InvalidTimeout
        );

        let lock = &mut ctx.accounts.lock;

        // If lock is held, check if it has expired
        if lock.lock_holder != Pubkey::default() {
            let now = Clock::get()?.unix_timestamp;
            require!(
                now >= lock.locked_at + lock.timeout_seconds,
                ErrorCode::LockHeld
            );
            msg!("Overriding expired lock held by {}", lock.lock_holder);
        }

        lock.lock_holder = ctx.accounts.authority.key();
        lock.locked_at = Clock::get()?.unix_timestamp;
        lock.timeout_seconds = timeout_seconds;
        lock.run_id = 0;
        msg!("Lock acquired by {}", lock.lock_holder);
        Ok(())
    }

    /// Release the airdrop lock (holder only)
    pub fn release_lock(ctx: Context<ReleaseLock>) -> Result<()> {
        let lock = &mut ctx.accounts.lock;
        require!(
            lock.lock_holder == ctx.accounts.authority.key(),
            ErrorCode::LockNotHeld
        );

        msg!("Lock released by {}", lock.lock_holder);
        lock.lock_holder = Pubkey::default();
        lock.locked_at = 0;
        lock.timeout_seconds = 0;
        lock.run_id = 0;
        Ok(())
    }
}

// ============================================================================
// State Accounts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + GlobalState::INIT_SPACE,
        seeds = [b"state"],
        bump
    )]
    pub state: Account<'info, GlobalState>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateRunV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = authority,
        space = 8 + AirdropRunV2::INIT_SPACE,
        seeds = [b"run_v2", (state.run_counter + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub airdrop_run: Account<'info, AirdropRunV2>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRunTotalsV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [b"run_v2", airdrop_run.run_id.to_le_bytes().as_ref()],
        bump = airdrop_run.bump
    )]
    pub airdrop_run: Account<'info, AirdropRunV2>,
}

#[derive(Accounts)]
#[instruction(eth_address: [u8; 42])]
pub struct InitializeRecordV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = authority,
        space = 8 + AirdropRecordV2::INIT_SPACE,
        seeds = [
            b"airdrop_record_v2",
            &eth_address[..21],
            &eth_address[21..42],
        ],
        bump
    )]
    pub airdrop_record: Account<'info, AirdropRecordV2>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRecordV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [
            b"airdrop_record_v2",
            &airdrop_record.eth_address[..21],
            &airdrop_record.eth_address[21..42],
        ],
        bump = airdrop_record.bump
    )]
    pub airdrop_record: Account<'info, AirdropRecordV2>,
}

#[derive(Accounts)]
pub struct CloseRecordV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,

    #[account(
        mut,
        close = authority,
        seeds = [
            b"airdrop_record_v2",
            &airdrop_record.eth_address[..21],
            &airdrop_record.eth_address[21..42],
        ],
        bump = airdrop_record.bump
    )]
    pub airdrop_record: Account<'info, AirdropRecordV2>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,
}

#[derive(Accounts)]
pub struct InitializeLock<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = authority,
        space = 8 + AirdropLock::INIT_SPACE,
        seeds = [b"lock"],
        bump
    )]
    pub lock: Account<'info, AirdropLock>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcquireLock<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [b"lock"],
        bump = lock.bump
    )]
    pub lock: Account<'info, AirdropLock>,
}

#[derive(Accounts)]
pub struct ReleaseLock<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"state"],
        bump = state.bump,
        constraint = state.authority == authority.key() @ ErrorCode::Unauthorized
    )]
    pub state: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [b"lock"],
        bump = lock.bump
    )]
    pub lock: Account<'info, AirdropLock>,
}

// ============================================================================
// Account Structs
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    /// Authority who can create runs and update records
    pub authority: Pubkey, // 32 bytes
    /// Counter for run IDs
    pub run_counter: u64, // 8 bytes
    /// PDA bump
    pub bump: u8, // 1 byte
}

#[account]
#[derive(InitSpace)]
pub struct AirdropRunV2 {
    /// Schema version (set to 1)
    pub version: u8, // 1 byte
    /// Unique run ID
    pub run_id: u64, // 8 bytes
    /// Unix timestamp when run started
    pub run_date: i64, // 8 bytes
    /// Number of successful recipients
    pub total_recipients: u32, // 4 bytes
    /// Total combined amount airdropped (preserved from v1)
    pub total_amount: u64, // 8 bytes
    /// Total XNM amount airdropped
    pub total_xnm_amount: u64, // 8 bytes
    /// Total XBLK amount airdropped
    pub total_xblk_amount: u64, // 8 bytes
    /// Total XUNI amount airdropped
    pub total_xuni_amount: u64, // 8 bytes
    /// Total native (XNT) amount airdropped
    pub total_native_amount: u64, // 8 bytes
    /// Whether this was a dry run
    pub dry_run: bool, // 1 byte
    /// Reserved space for future use
    pub reserved: [u64; 4], // 32 bytes
    /// PDA bump
    pub bump: u8, // 1 byte
}

#[account]
#[derive(InitSpace)]
pub struct AirdropRecordV2 {
    /// The associated ETH address (as UTF-8 bytes, e.g., "0x1234...")
    pub eth_address: [u8; 42], // 42 bytes
    /// Cumulative XNM amount airdropped (in token base units, 9 decimals)
    pub xnm_airdropped: u64, // 8 bytes
    /// Cumulative XBLK amount airdropped (in token base units, 9 decimals)
    pub xblk_airdropped: u64, // 8 bytes
    /// Cumulative XUNI amount airdropped (in token base units, 9 decimals)
    pub xuni_airdropped: u64, // 8 bytes
    /// Cumulative native token (XNT) airdropped (in lamports, 9 decimals)
    pub native_airdropped: u64, // 8 bytes
    /// Reserved space for future use (8 bytes each * 4 = 32 bytes)
    pub reserved: [u64; 4], // 32 bytes
    /// Unix timestamp of last update
    pub last_updated: i64, // 8 bytes
    /// PDA bump seed for derivation
    pub bump: u8, // 1 byte
}

#[account]
#[derive(InitSpace)]
pub struct AirdropLock {
    /// Public key of the current lock holder
    pub lock_holder: Pubkey, // 32 bytes
    /// Unix timestamp when the lock was acquired
    pub locked_at: i64, // 8 bytes
    /// Lock timeout duration in seconds
    pub timeout_seconds: i64, // 8 bytes
    /// Associated run ID (set after create_run for audit trail)
    pub run_id: u64, // 8 bytes
    /// PDA bump
    pub bump: u8, // 1 byte
}

#[error_code]
pub enum ErrorCode {
    #[msg("Arithmetic overflow when updating total")]
    Overflow,
    #[msg("Unauthorized: signer is not the authority")]
    Unauthorized,
    #[msg("Lock is currently held by another process")]
    LockHeld,
    #[msg("Invalid timeout: must be between 60 and 3600 seconds")]
    InvalidTimeout,
    #[msg("Lock is not held by the caller")]
    LockNotHeld,
}
