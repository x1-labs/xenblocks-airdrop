import { describe, it, expect, beforeAll } from 'vitest';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';

// Skip entire suite when not running under anchor test (no local validator)
const hasValidator = !!process.env.ANCHOR_PROVIDER_URL;

const PROGRAM_ID = new PublicKey('xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv');

function deriveStatePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('state')], PROGRAM_ID);
}

function deriveLockPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('lock')], PROGRAM_ID);
}

// Lazily initialized in beforeAll to avoid crashing when ANCHOR_PROVIDER_URL is missing
let anchor: typeof import('@coral-xyz/anchor');
let provider: import('@coral-xyz/anchor').AnchorProvider;
let program: import('@coral-xyz/anchor').Program<
  import('../../target/types/xenblocks_airdrop_tracker').XenblocksAirdropTracker
>;
let authority: import('@coral-xyz/anchor').Wallet;

const [statePDA] = deriveStatePDA();
const [lockPDA] = deriveLockPDA();

describe.skipIf(!hasValidator)('AirdropLock on-chain tests', () => {
  beforeAll(async () => {
    anchor = await import('@coral-xyz/anchor');
    const IDL = (
      await import('../../target/idl/xenblocks_airdrop_tracker.json')
    ).default;

    provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    program = new anchor.Program(
      IDL as anchor.Idl,
      provider
    ) as unknown as typeof program;

    authority = provider.wallet as import('@coral-xyz/anchor').Wallet;

    // Initialize global state if not already done
    const stateAccount = await provider.connection.getAccountInfo(statePDA);
    if (!stateAccount) {
      await program.methods
        .initializeState()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  });

  describe('initialize_lock', () => {
    it('should initialize the lock PDA', async () => {
      const lockAccount = await provider.connection.getAccountInfo(lockPDA);
      if (lockAccount) {
        // Already initialized from a previous test run — skip init
        return;
      }

      await program.methods
        .initializeLock()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const lock = await program.account.airdropLock.fetch(lockPDA);
      expect(lock.lockHolder.equals(PublicKey.default)).toBe(true);
      expect(lock.lockedAt.toNumber()).toBe(0);
      expect(lock.timeoutSeconds.toNumber()).toBe(0);
      expect(lock.runId.toNumber()).toBe(0);
    });

    it('should fail to initialize twice', async () => {
      // Ensure lock is initialized
      const lockAccount = await provider.connection.getAccountInfo(lockPDA);
      if (!lockAccount) {
        await program.methods
          .initializeLock()
          .accounts({
            authority: authority.publicKey,
            state: statePDA,
            lock: lockPDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      // Second init should fail (account already exists)
      await expect(
        program.methods
          .initializeLock()
          .accounts({
            authority: authority.publicKey,
            state: statePDA,
            lock: lockPDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc()
      ).rejects.toThrow();
    });
  });

  describe('acquire_lock', () => {
    beforeAll(async () => {
      // Ensure lock is initialized
      const lockAccount = await provider.connection.getAccountInfo(lockPDA);
      if (!lockAccount) {
        await program.methods
          .initializeLock()
          .accounts({
            authority: authority.publicKey,
            state: statePDA,
            lock: lockPDA,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      // Release if held from a previous test
      const lock = await program.account.airdropLock.fetch(lockPDA);
      if (!lock.lockHolder.equals(PublicKey.default)) {
        try {
          await program.methods
            .releaseLock()
            .accounts({
              authority: authority.publicKey,
              state: statePDA,
              lock: lockPDA,
            })
            .rpc();
        } catch {
          // May fail if lock is held by someone else; continue
        }
      }
    });

    it('should acquire an unheld lock', async () => {
      await program.methods
        .acquireLock(new anchor.BN(60))
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      const lock = await program.account.airdropLock.fetch(lockPDA);
      expect(lock.lockHolder.equals(authority.publicKey)).toBe(true);
      expect(lock.timeoutSeconds.toNumber()).toBe(60);
      expect(lock.lockedAt.toNumber()).toBeGreaterThan(0);

      // Clean up
      await program.methods
        .releaseLock()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();
    });

    it('should reject timeout below 60', async () => {
      await expect(
        program.methods
          .acquireLock(new anchor.BN(30))
          .accounts({
            authority: authority.publicKey,
            state: statePDA,
            lock: lockPDA,
          })
          .rpc()
      ).rejects.toThrow(/InvalidTimeout|0x1773/);
    });

    it('should reject timeout above 3600', async () => {
      await expect(
        program.methods
          .acquireLock(new anchor.BN(7200))
          .accounts({
            authority: authority.publicKey,
            state: statePDA,
            lock: lockPDA,
          })
          .rpc()
      ).rejects.toThrow(/InvalidTimeout|0x1773/);
    });

    it('should fail when lock is already held (not expired)', async () => {
      // Acquire with max timeout so it won't expire
      await program.methods
        .acquireLock(new anchor.BN(3600))
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      // Second acquire should fail with LockHeld
      await expect(
        program.methods
          .acquireLock(new anchor.BN(60))
          .accounts({
            authority: authority.publicKey,
            state: statePDA,
            lock: lockPDA,
          })
          .rpc()
      ).rejects.toThrow(/LockHeld|0x1772/);

      // Clean up
      await program.methods
        .releaseLock()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();
    });

    it('should accept max timeout (3600)', async () => {
      await program.methods
        .acquireLock(new anchor.BN(3600))
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      const lock = await program.account.airdropLock.fetch(lockPDA);
      expect(lock.timeoutSeconds.toNumber()).toBe(3600);

      // Clean up
      await program.methods
        .releaseLock()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();
    });

    it('should accept min timeout (60)', async () => {
      await program.methods
        .acquireLock(new anchor.BN(60))
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      const lock = await program.account.airdropLock.fetch(lockPDA);
      expect(lock.timeoutSeconds.toNumber()).toBe(60);

      // Clean up
      await program.methods
        .releaseLock()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();
    });
  });

  describe('release_lock', () => {
    it('should release a held lock', async () => {
      // Acquire first
      await program.methods
        .acquireLock(new anchor.BN(300))
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      // Release
      await program.methods
        .releaseLock()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      const lock = await program.account.airdropLock.fetch(lockPDA);
      expect(lock.lockHolder.equals(PublicKey.default)).toBe(true);
      expect(lock.lockedAt.toNumber()).toBe(0);
      expect(lock.timeoutSeconds.toNumber()).toBe(0);
      expect(lock.runId.toNumber()).toBe(0);
    });

    it('should fail when lock is not held by caller', async () => {
      // Lock is currently released (holder = default), so release should fail
      await expect(
        program.methods
          .releaseLock()
          .accounts({
            authority: authority.publicKey,
            state: statePDA,
            lock: lockPDA,
          })
          .rpc()
      ).rejects.toThrow(/LockNotHeld|0x1774/);
    });
  });

  describe('unauthorized access', () => {
    it('should reject acquire from non-authority', async () => {
      const fakeAuthority = Keypair.generate();

      // Airdrop some SOL to the fake authority for tx fees
      const sig = await provider.connection.requestAirdrop(
        fakeAuthority.publicKey,
        1_000_000_000
      );
      await provider.connection.confirmTransaction(sig);

      await expect(
        program.methods
          .acquireLock(new anchor.BN(60))
          .accounts({
            authority: fakeAuthority.publicKey,
            state: statePDA,
            lock: lockPDA,
          })
          .signers([fakeAuthority])
          .rpc()
      ).rejects.toThrow(/Unauthorized|0x1771|ConstraintRaw|2003/);
    });
  });

  describe('acquire-release cycle', () => {
    it('should support acquire → release → re-acquire', async () => {
      // Acquire
      await program.methods
        .acquireLock(new anchor.BN(120))
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      let lock = await program.account.airdropLock.fetch(lockPDA);
      expect(lock.lockHolder.equals(authority.publicKey)).toBe(true);

      // Release
      await program.methods
        .releaseLock()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      lock = await program.account.airdropLock.fetch(lockPDA);
      expect(lock.lockHolder.equals(PublicKey.default)).toBe(true);

      // Re-acquire with different timeout
      await program.methods
        .acquireLock(new anchor.BN(600))
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();

      lock = await program.account.airdropLock.fetch(lockPDA);
      expect(lock.lockHolder.equals(authority.publicKey)).toBe(true);
      expect(lock.timeoutSeconds.toNumber()).toBe(600);

      // Clean up
      await program.methods
        .releaseLock()
        .accounts({
          authority: authority.publicKey,
          state: statePDA,
          lock: lockPDA,
        })
        .rpc();
    });
  });
});
