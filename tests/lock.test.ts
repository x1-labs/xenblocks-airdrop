import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { deriveAirdropLockPDA } from '../src/onchain/pda';
import { deserializeAirdropLock } from '../src/onchain/client';
import { AIRDROP_LOCK_OFFSETS, AIRDROP_LOCK_SIZE } from '../src/onchain/types';

const PROGRAM_ID = new PublicKey('xen8pjUWEnRbm1eML9CGtHvmmQfruXMKUybqGjn3chv');

describe('deriveAirdropLockPDA', () => {
  it('should derive a deterministic PDA from "lock" seed', () => {
    const [pda, bump] = deriveAirdropLockPDA(PROGRAM_ID);

    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it('should return the same PDA on repeated calls', () => {
    const [pda1] = deriveAirdropLockPDA(PROGRAM_ID);
    const [pda2] = deriveAirdropLockPDA(PROGRAM_ID);

    expect(pda1.equals(pda2)).toBe(true);
  });

  it('should derive different PDAs for different program IDs', () => {
    const otherProgram = new PublicKey('11111111111111111111111111111111');
    const [pda1] = deriveAirdropLockPDA(PROGRAM_ID);
    const [pda2] = deriveAirdropLockPDA(otherProgram);

    expect(pda1.equals(pda2)).toBe(false);
  });
});

describe('AIRDROP_LOCK_OFFSETS', () => {
  it('should have correct offset values', () => {
    expect(AIRDROP_LOCK_OFFSETS.DISCRIMINATOR).toBe(0);
    expect(AIRDROP_LOCK_OFFSETS.LOCK_HOLDER).toBe(8);
    expect(AIRDROP_LOCK_OFFSETS.LOCKED_AT).toBe(40);
    expect(AIRDROP_LOCK_OFFSETS.TIMEOUT_SECONDS).toBe(48);
    expect(AIRDROP_LOCK_OFFSETS.RUN_ID).toBe(56);
    expect(AIRDROP_LOCK_OFFSETS.BUMP).toBe(64);
  });

  it('should have correct total size', () => {
    expect(AIRDROP_LOCK_SIZE).toBe(65);
  });
});

describe('deserializeAirdropLock', () => {
  function buildLockBuffer(opts: {
    lockHolder?: PublicKey;
    lockedAt?: bigint;
    timeoutSeconds?: bigint;
    runId?: bigint;
    bump?: number;
  }): Buffer {
    const buf = Buffer.alloc(AIRDROP_LOCK_SIZE);
    // 8-byte discriminator (arbitrary)
    buf.writeUInt32LE(0xdeadbeef, 0);

    const holder = opts.lockHolder ?? PublicKey.default;
    holder.toBuffer().copy(buf, AIRDROP_LOCK_OFFSETS.LOCK_HOLDER);

    buf.writeBigInt64LE(opts.lockedAt ?? 0n, AIRDROP_LOCK_OFFSETS.LOCKED_AT);
    buf.writeBigInt64LE(
      opts.timeoutSeconds ?? 0n,
      AIRDROP_LOCK_OFFSETS.TIMEOUT_SECONDS
    );
    buf.writeBigUInt64LE(opts.runId ?? 0n, AIRDROP_LOCK_OFFSETS.RUN_ID);
    buf.writeUInt8(opts.bump ?? 255, AIRDROP_LOCK_OFFSETS.BUMP);

    return buf;
  }

  it('should deserialize a default (unlocked) lock', () => {
    const buf = buildLockBuffer({});
    const lock = deserializeAirdropLock(buf);

    expect(lock.lockHolder.equals(PublicKey.default)).toBe(true);
    expect(lock.lockedAt).toBe(0n);
    expect(lock.timeoutSeconds).toBe(0n);
    expect(lock.runId).toBe(0n);
    expect(lock.bump).toBe(255);
  });

  it('should deserialize a held lock', () => {
    const holder = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
    const buf = buildLockBuffer({
      lockHolder: holder,
      lockedAt: 1709500000n,
      timeoutSeconds: 1800n,
      runId: 42n,
      bump: 253,
    });

    const lock = deserializeAirdropLock(buf);

    expect(lock.lockHolder.equals(holder)).toBe(true);
    expect(lock.lockedAt).toBe(1709500000n);
    expect(lock.timeoutSeconds).toBe(1800n);
    expect(lock.runId).toBe(42n);
    expect(lock.bump).toBe(253);
  });

  it('should handle max timeout value (3600)', () => {
    const buf = buildLockBuffer({ timeoutSeconds: 3600n });
    const lock = deserializeAirdropLock(buf);

    expect(lock.timeoutSeconds).toBe(3600n);
  });

  it('should handle min timeout value (60)', () => {
    const buf = buildLockBuffer({ timeoutSeconds: 60n });
    const lock = deserializeAirdropLock(buf);

    expect(lock.timeoutSeconds).toBe(60n);
  });
});

describe('lock instruction builders', () => {
  // We test that instruction builders produce correct account keys and data.
  // These are imported lazily to keep tests focused.
  it('should build initialize_lock instruction with correct accounts', async () => {
    const { createInitializeLockInstruction } =
      await import('../src/onchain/client');
    const { SystemProgram } = await import('@solana/web3.js');

    const authority = new PublicKey(
      'BPFLoaderUpgradeab1e11111111111111111111111'
    );
    const ix = createInitializeLockInstruction(PROGRAM_ID, authority);

    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
    // 4 accounts: authority, state, lock, system_program
    expect(ix.keys).toHaveLength(4);
    expect(ix.keys[0].pubkey.equals(authority)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[0].isWritable).toBe(true);
    // state is read-only
    expect(ix.keys[1].isWritable).toBe(false);
    // lock is writable
    expect(ix.keys[2].isWritable).toBe(true);
    // system_program
    expect(ix.keys[3].pubkey.equals(SystemProgram.programId)).toBe(true);
    // Discriminator is 8 bytes
    expect(ix.data.length).toBe(8);
  });

  it('should build acquire_lock instruction with timeout in data', async () => {
    const { createAcquireLockInstruction } =
      await import('../src/onchain/client');

    const authority = new PublicKey(
      'BPFLoaderUpgradeab1e11111111111111111111111'
    );
    const ix = createAcquireLockInstruction(PROGRAM_ID, authority, 1800n);

    // 3 accounts: authority, state, lock
    expect(ix.keys).toHaveLength(3);
    expect(ix.keys[0].pubkey.equals(authority)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    // lock is writable
    expect(ix.keys[2].isWritable).toBe(true);
    // 8 bytes discriminator + 8 bytes timeout
    expect(ix.data.length).toBe(16);
    // Verify timeout is serialized as i64 LE at offset 8
    const timeout = ix.data.readBigInt64LE(8);
    expect(timeout).toBe(1800n);
  });

  it('should build release_lock instruction with correct accounts', async () => {
    const { createReleaseLockInstruction } =
      await import('../src/onchain/client');

    const authority = new PublicKey(
      'BPFLoaderUpgradeab1e11111111111111111111111'
    );
    const ix = createReleaseLockInstruction(PROGRAM_ID, authority);

    // 3 accounts: authority, state, lock
    expect(ix.keys).toHaveLength(3);
    // lock is writable
    expect(ix.keys[2].isWritable).toBe(true);
    // Discriminator only (8 bytes)
    expect(ix.data.length).toBe(8);
  });

  it('should use lock PDA as the lock account key', async () => {
    const { createAcquireLockInstruction, createReleaseLockInstruction } =
      await import('../src/onchain/client');

    const authority = new PublicKey(
      'BPFLoaderUpgradeab1e11111111111111111111111'
    );
    const [expectedLockPda] = deriveAirdropLockPDA(PROGRAM_ID);

    const acquireIx = createAcquireLockInstruction(PROGRAM_ID, authority, 600n);
    const releaseIx = createReleaseLockInstruction(PROGRAM_ID, authority);

    // Lock account is at index 2
    expect(acquireIx.keys[2].pubkey.equals(expectedLockPda)).toBe(true);
    expect(releaseIx.keys[2].pubkey.equals(expectedLockPda)).toBe(true);
  });
});
