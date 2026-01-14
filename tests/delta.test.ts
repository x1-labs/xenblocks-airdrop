import { describe, it, expect } from 'vitest';
import { calculateDeltas, calculateTotalAmount } from '../src/airdrop/delta';
import { Miner, DeltaResult } from '../src/airdrop/types';

describe('calculateDeltas', () => {
  it('should return full amount for new wallets (not in snapshot)', () => {
    const miners: Miner[] = [
      { account: '0xeth1', solAddress: 'wallet1', xnm: '1E+18' },
    ];
    const snapshot = new Map<string, bigint>();

    const result = calculateDeltas(miners, snapshot);

    expect(result).toHaveLength(1);
    expect(result[0].walletAddress).toBe('wallet1');
    expect(result[0].deltaAmount).toBe(1000000000n); // 1E+18 / 10^9
    expect(result[0].previousAmount).toBe(0n);
  });

  it('should calculate positive delta for existing wallets with increase', () => {
    const miners: Miner[] = [
      { account: '0xeth1', solAddress: 'wallet1', xnm: '2E+18' },
    ];
    const snapshot = new Map<string, bigint>([['wallet1', 1000000000n]]);

    const result = calculateDeltas(miners, snapshot);

    expect(result).toHaveLength(1);
    expect(result[0].deltaAmount).toBe(1000000000n); // 2E+18/10^9 - 1E+9 = 1E+9
    expect(result[0].previousAmount).toBe(1000000000n);
  });

  it('should exclude wallets with zero delta (same amount)', () => {
    const miners: Miner[] = [
      { account: '0xeth1', solAddress: 'wallet1', xnm: '1E+18' },
    ];
    const snapshot = new Map<string, bigint>([['wallet1', 1000000000n]]);

    const result = calculateDeltas(miners, snapshot);

    expect(result).toHaveLength(0);
  });

  it('should exclude wallets with negative delta (decreased amount)', () => {
    const miners: Miner[] = [
      { account: '0xeth1', solAddress: 'wallet1', xnm: '5E+17' },
    ];
    const snapshot = new Map<string, bigint>([['wallet1', 1000000000n]]);

    const result = calculateDeltas(miners, snapshot);

    expect(result).toHaveLength(0);
  });

  it('should handle mixed scenarios with multiple wallets', () => {
    const miners: Miner[] = [
      { account: '0xeth1', solAddress: 'wallet1', xnm: '3E+18' }, // increased
      { account: '0xeth2', solAddress: 'wallet2', xnm: '1E+18' }, // same
      { account: '0xeth3', solAddress: 'wallet3', xnm: '5E+17' }, // decreased
      { account: '0xeth4', solAddress: 'wallet4', xnm: '2E+18' }, // new
    ];
    const snapshot = new Map<string, bigint>([
      ['wallet1', 1000000000n],
      ['wallet2', 1000000000n],
      ['wallet3', 1000000000n],
    ]);

    const result = calculateDeltas(miners, snapshot);

    expect(result).toHaveLength(2);

    const wallet1Delta = result.find((r) => r.walletAddress === 'wallet1');
    expect(wallet1Delta?.deltaAmount).toBe(2000000000n);

    const wallet4Delta = result.find((r) => r.walletAddress === 'wallet4');
    expect(wallet4Delta?.deltaAmount).toBe(2000000000n);
  });

  it('should preserve ETH address and API amount in results', () => {
    const miners: Miner[] = [
      { account: '0xabcdef123456', solAddress: 'wallet1', xnm: '1.5E+18' },
    ];
    const snapshot = new Map<string, bigint>();

    const result = calculateDeltas(miners, snapshot);

    expect(result[0].ethAddress).toBe('0xabcdef123456');
    expect(result[0].apiAmount).toBe('1.5E+18');
  });
});

describe('calculateTotalAmount', () => {
  it('should sum all delta amounts', () => {
    const deltas: DeltaResult[] = [
      {
        walletAddress: 'wallet1',
        ethAddress: '0xeth1',
        apiAmount: '1E+18',
        currentAmount: 1000000000n,
        previousAmount: 0n,
        deltaAmount: 1000000000n,
      },
      {
        walletAddress: 'wallet2',
        ethAddress: '0xeth2',
        apiAmount: '2E+18',
        currentAmount: 2000000000n,
        previousAmount: 0n,
        deltaAmount: 2000000000n,
      },
    ];

    const total = calculateTotalAmount(deltas);

    expect(total).toBe(3000000000n);
  });

  it('should return 0 for empty array', () => {
    const total = calculateTotalAmount([]);

    expect(total).toBe(0n);
  });
});
