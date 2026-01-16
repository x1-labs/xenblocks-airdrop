import { describe, it, expect } from 'vitest';
import {
  convertApiAmountToTokenAmount,
  formatTokenAmount,
} from '../src/utils/format';

describe('convertApiAmountToTokenAmount', () => {
  it('should convert scientific notation with positive exponent', () => {
    // 1.351984E+25 = 13,519,840,000,000,000,000,000,000 (18 decimals)
    // Divided by 10^9 = 13,519,840,000,000,000 (9 decimals)
    const result = convertApiAmountToTokenAmount('1.351984E+25');
    expect(result).toBe(13519840000000000n);
  });

  it('should convert scientific notation without decimal', () => {
    // 1E+18 = 1,000,000,000,000,000,000
    // Divided by 10^9 = 1,000,000,000
    const result = convertApiAmountToTokenAmount('1E+18');
    expect(result).toBe(1000000000n);
  });

  it('should handle regular large numbers', () => {
    // 1000000000000000000 (10^18)
    // Divided by 10^9 = 1,000,000,000
    const result = convertApiAmountToTokenAmount('1000000000000000000');
    expect(result).toBe(1000000000n);
  });

  it('should return 0 for very small amounts', () => {
    // Numbers smaller than 10^9 will result in 0
    const result = convertApiAmountToTokenAmount('100000000');
    expect(result).toBe(0n);
  });

  it('should handle zero', () => {
    const result = convertApiAmountToTokenAmount('0');
    expect(result).toBe(0n);
  });

  it('should truncate regular numbers (no rounding)', () => {
    // 1500000000 / 10^9 = 1.5, truncates to 1
    const result = convertApiAmountToTokenAmount('1500000000');
    expect(result).toBe(1n);
  });

  it('should truncate regular numbers correctly', () => {
    // 1900000000 / 10^9 = 1.9, truncates to 1
    const result = convertApiAmountToTokenAmount('1900000000');
    expect(result).toBe(1n);
  });

  it('should handle scientific notation with small exponent', () => {
    // 5E+9 = 5,000,000,000
    // Divided by 10^9 = 5
    const result = convertApiAmountToTokenAmount('5E+9');
    expect(result).toBe(5n);
  });

  it('should handle very large scientific notation', () => {
    // 9.99E+30
    const result = convertApiAmountToTokenAmount('9.99E+30');
    expect(result).toBe(9990000000000000000000n);
  });
});

describe('formatTokenAmount', () => {
  it('should format whole numbers without decimals', () => {
    // 1000000000 base units = 1.0 tokens (9 decimals)
    const result = formatTokenAmount(1000000000n, 9);
    expect(result).toBe('1');
  });

  it('should format amounts with trailing zeros removed', () => {
    // 1500000000 base units = 1.5 tokens
    const result = formatTokenAmount(1500000000n, 9);
    expect(result).toBe('1.5');
  });

  it('should format amounts with full precision', () => {
    // 1234567891 base units = 1.234567891 tokens
    const result = formatTokenAmount(1234567891n, 9);
    expect(result).toBe('1.234567891');
  });

  it('should format zero correctly', () => {
    const result = formatTokenAmount(0n, 9);
    expect(result).toBe('0');
  });

  it('should format very large amounts', () => {
    // 1000000000000000000 base units = 1,000,000,000 tokens
    const result = formatTokenAmount(1000000000000000000n, 9);
    expect(result).toBe('1000000000');
  });

  it('should format amounts less than 1 token', () => {
    // 500000000 base units = 0.5 tokens
    const result = formatTokenAmount(500000000n, 9);
    expect(result).toBe('0.5');
  });

  it('should handle different decimal places', () => {
    // 1500000 base units with 6 decimals = 1.5 tokens
    const result = formatTokenAmount(1500000n, 6);
    expect(result).toBe('1.5');
  });

  it('should preserve leading zeros in fractional part', () => {
    // 1001000000 base units = 1.001 tokens
    const result = formatTokenAmount(1001000000n, 9);
    expect(result).toBe('1.001');
  });
});
