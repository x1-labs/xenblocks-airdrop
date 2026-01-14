use anchor_lang::prelude::*;

declare_id!("JAzubT5NSiyRkLgaFRTkrdLGzzMb57CVhMhdDCiqoRu6");

#[program]
pub mod xnm_airdrop_tracker {
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

    /// Create a new airdrop run
    pub fn create_run(ctx: Context<CreateRun>, dry_run: bool) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let run = &mut ctx.accounts.airdrop_run;

        state.run_counter += 1;

        run.run_id = state.run_counter;
        run.run_date = Clock::get()?.unix_timestamp;
        run.total_recipients = 0;
        run.total_amount = 0;
        run.dry_run = dry_run;
        run.bump = ctx.bumps.airdrop_run;

        msg!("Created airdrop run #{}", run.run_id);
        Ok(())
    }

    /// Update run totals after completion
    pub fn update_run_totals(
        ctx: Context<UpdateRunTotals>,
        total_recipients: u32,
        total_amount: u64,
    ) -> Result<()> {
        let run = &mut ctx.accounts.airdrop_run;
        run.total_recipients = total_recipients;
        run.total_amount = total_amount;

        msg!(
            "Updated run #{}: recipients={}, amount={}",
            run.run_id,
            total_recipients,
            total_amount
        );
        Ok(())
    }

    /// Initialize a new airdrop record for a wallet/eth pair
    pub fn initialize_record(
        ctx: Context<InitializeRecord>,
        eth_address: [u8; 42],
    ) -> Result<()> {
        let record = &mut ctx.accounts.airdrop_record;
        record.sol_wallet = ctx.accounts.sol_wallet.key();
        record.eth_address = eth_address;
        record.xnm_airdropped = 0;
        record.xblk_airdropped = 0;
        record.reserved = [0u64; 6];
        record.last_updated = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.airdrop_record;

        msg!(
            "Initialized airdrop record for wallet: {}",
            ctx.accounts.sol_wallet.key()
        );
        Ok(())
    }

    /// Update an existing airdrop record after a successful transfer
    /// token_type: 0 = XNM, 1 = XBLK
    pub fn update_record(
        ctx: Context<UpdateRecord>,
        token_type: u8,
        amount_to_add: u64,
    ) -> Result<()> {
        let record = &mut ctx.accounts.airdrop_record;

        match token_type {
            0 => {
                record.xnm_airdropped = record
                    .xnm_airdropped
                    .checked_add(amount_to_add)
                    .ok_or(ErrorCode::Overflow)?;
            }
            1 => {
                record.xblk_airdropped = record
                    .xblk_airdropped
                    .checked_add(amount_to_add)
                    .ok_or(ErrorCode::Overflow)?;
            }
            _ => return Err(ErrorCode::InvalidTokenType.into()),
        }
        record.last_updated = Clock::get()?.unix_timestamp;

        msg!(
            "Updated airdrop record: wallet={}, token_type={}, added={}",
            record.sol_wallet,
            token_type,
            amount_to_add
        );
        Ok(())
    }

    /// Initialize a record and immediately update it (for new wallets during airdrop)
    /// token_type: 0 = XNM, 1 = XBLK
    pub fn initialize_and_update(
        ctx: Context<InitializeRecord>,
        eth_address: [u8; 42],
        token_type: u8,
        initial_amount: u64,
    ) -> Result<()> {
        let record = &mut ctx.accounts.airdrop_record;
        record.sol_wallet = ctx.accounts.sol_wallet.key();
        record.eth_address = eth_address;
        record.xnm_airdropped = 0;
        record.xblk_airdropped = 0;
        record.reserved = [0u64; 6];

        match token_type {
            0 => record.xnm_airdropped = initial_amount,
            1 => record.xblk_airdropped = initial_amount,
            _ => return Err(ErrorCode::InvalidTokenType.into()),
        }

        record.last_updated = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.airdrop_record;

        msg!(
            "Initialized and updated airdrop record: wallet={}, token_type={}, amount={}",
            ctx.accounts.sol_wallet.key(),
            token_type,
            initial_amount
        );
        Ok(())
    }

    /// Close an airdrop record and reclaim rent (admin only)
    pub fn close_record(_ctx: Context<CloseRecord>) -> Result<()> {
        msg!("Closed airdrop record and reclaimed rent");
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
pub struct CreateRun<'info> {
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
        space = 8 + AirdropRun::INIT_SPACE,
        seeds = [b"run", (state.run_counter + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub airdrop_run: Account<'info, AirdropRun>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRunTotals<'info> {
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
        seeds = [b"run", airdrop_run.run_id.to_le_bytes().as_ref()],
        bump = airdrop_run.bump
    )]
    pub airdrop_run: Account<'info, AirdropRun>,
}

#[derive(Accounts)]
#[instruction(eth_address: [u8; 42])]
pub struct InitializeRecord<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The wallet that will receive airdrops (does not need to sign)
    pub sol_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + AirdropRecord::INIT_SPACE,
        seeds = [
            b"airdrop_record",
            sol_wallet.key().as_ref(),
            &eth_address[..20],
        ],
        bump
    )]
    pub airdrop_record: Account<'info, AirdropRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRecord<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"airdrop_record",
            airdrop_record.sol_wallet.as_ref(),
            &airdrop_record.eth_address[..20],
        ],
        bump = airdrop_record.bump
    )]
    pub airdrop_record: Account<'info, AirdropRecord>,
}

#[derive(Accounts)]
pub struct CloseRecord<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        close = authority,
        seeds = [
            b"airdrop_record",
            airdrop_record.sol_wallet.as_ref(),
            &airdrop_record.eth_address[..20],
        ],
        bump = airdrop_record.bump
    )]
    pub airdrop_record: Account<'info, AirdropRecord>,
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
pub struct AirdropRun {
    /// Unique run ID
    pub run_id: u64, // 8 bytes
    /// Unix timestamp when run started
    pub run_date: i64, // 8 bytes
    /// Number of successful recipients
    pub total_recipients: u32, // 4 bytes
    /// Total amount airdropped (in token base units)
    pub total_amount: u64, // 8 bytes
    /// Whether this was a dry run
    pub dry_run: bool, // 1 byte
    /// PDA bump
    pub bump: u8, // 1 byte
}

#[account]
#[derive(InitSpace)]
pub struct AirdropRecord {
    /// The Solana wallet address that receives airdrops
    pub sol_wallet: Pubkey, // 32 bytes
    /// The associated ETH address (as UTF-8 bytes, e.g., "0x1234...")
    pub eth_address: [u8; 42], // 42 bytes
    /// Cumulative XNM amount airdropped (in token base units, 9 decimals)
    pub xnm_airdropped: u64, // 8 bytes
    /// Cumulative XBLK amount airdropped (in token base units, 9 decimals)
    pub xblk_airdropped: u64, // 8 bytes
    /// Reserved space for future tokens (8 bytes each * 6 = 48 bytes)
    pub reserved: [u64; 6], // 48 bytes
    /// Unix timestamp of last update
    pub last_updated: i64, // 8 bytes
    /// PDA bump seed for derivation
    pub bump: u8, // 1 byte
}

#[error_code]
pub enum ErrorCode {
    #[msg("Arithmetic overflow when updating total")]
    Overflow,
    #[msg("Unauthorized: signer is not the authority")]
    Unauthorized,
    #[msg("Invalid token type: must be 0 (XNM) or 1 (XBLK)")]
    InvalidTokenType,
}
