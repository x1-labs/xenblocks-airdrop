import { config } from '@/config';

/**
 * Format a token amount from base units to human readable with abbreviations
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number = config.tokenDecimals
): string {
  const divisor = BigInt(10 ** decimals);
  const value = Number(amount) / Number(divisor);

  return formatCompactNumber(value);
}

/**
 * Format a number with K, M, B, T abbreviations
 */
export function formatCompactNumber(value: number): string {
  const absValue = Math.abs(value);

  if (absValue >= 1_000_000_000_000) {
    return (value / 1_000_000_000_000).toFixed(2) + 'T';
  }
  if (absValue >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + 'B';
  }
  if (absValue >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + 'M';
  }
  if (absValue >= 1_000) {
    return (value / 1_000).toFixed(2) + 'K';
  }
  if (absValue >= 1) {
    return value.toFixed(2);
  }
  return value.toFixed(6);
}

/**
 * Format a token amount with full precision (for detailed views)
 */
export function formatTokenAmountFull(
  amount: bigint,
  decimals: number = config.tokenDecimals
): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;

  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');

  if (fracStr === '') {
    return whole.toLocaleString();
  }

  return `${whole.toLocaleString()}.${fracStr.slice(0, 4)}`;
}

/**
 * Format a bigint timestamp to a date string
 */
export function formatTimestamp(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString();
}

/**
 * Format a date for display
 */
export function formatDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString();
}

/**
 * Convert ETH address bytes to string
 */
export function ethAddressToString(bytes: number[]): string {
  return String.fromCharCode(...bytes);
}

/**
 * Truncate a string in the middle
 */
export function truncateMiddle(str: string, maxLen: number = 16): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return `${str.slice(0, half)}...${str.slice(-half)}`;
}

/**
 * Get explorer URL for an address
 */
export function getExplorerUrl(address: string, type: 'address' | 'tx' = 'address'): string {
  return `${config.explorerUrl}/${type}/${address}`;
}
