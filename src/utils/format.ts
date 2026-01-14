/**
 * Convert API amount (18 decimals, often in scientific notation) to token amount (9 decimals)
 *
 * API returns amounts with 18 decimals in scientific notation
 * Example: "1.351984E+25" means 13,519,840,000,000,000,000,000,000 (smallest units)
 * Token on X1 uses 9 decimals, so we divide by 10^9
 */
export function convertApiAmountToTokenAmount(apiAmount: string): bigint {
  const amountStr = apiAmount.toString();

  // Handle scientific notation
  if (amountStr.toUpperCase().includes('E')) {
    const [mantissaStr, expStr] = amountStr.toUpperCase().split('E');
    const [intPart, decPart = ''] = mantissaStr.split('.');
    const mantissaDigits = intPart + decPart;
    const scientificExp = parseInt(expStr);
    const decimalPlaces = decPart.length;

    // Calculate the actual exponent (accounting for decimal places)
    const actualExp = scientificExp - decimalPlaces;

    // Handle negative exponents (very small numbers)
    if (actualExp < 0) {
      // Number is smaller than 1 in base units, result will be 0 after division
      return 0n;
    }

    const fullNumber = mantissaDigits + '0'.repeat(actualExp);

    // Convert from 18 to 9 decimals
    const bigIntValue = BigInt(fullNumber);
    const divisor = BigInt(10 ** 9);
    const result = bigIntValue / divisor;
    const remainder = bigIntValue % divisor;

    // Round if remainder is >= 0.5 * divisor (i.e., >= 500000000)
    if (remainder >= divisor / 2n) {
      return result + 1n;
    }
    return result;
  } else {
    // Regular number, just convert
    const [integerPart] = amountStr.split('.');
    const bigIntValue = BigInt(integerPart || '0');

    // If the number is already small, division might result in 0
    if (bigIntValue < BigInt(10 ** 9)) {
      return 0n;
    }

    return bigIntValue / BigInt(10 ** 9);
  }
}

/**
 * Format a token amount (in base units) for display
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number = 9
): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;

  // Pad fractional part with leading zeros if needed
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

  // Remove trailing zeros for cleaner display
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  if (trimmedFractional === '') {
    return wholePart.toString();
  }
  return `${wholePart}.${trimmedFractional}`;
}
