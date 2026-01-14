import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Config } from '../config.js';
import { formatTokenAmount } from '../utils/format.js';

export interface TransferResult {
  success: boolean;
  txSignature?: string;
  errorMessage?: string;
}

/**
 * Get the payer's token account balance
 */
export async function getPayerBalance(
  connection: Connection,
  payer: Keypair,
  config: Config
): Promise<{ balance: bigint; formatted: string; account: PublicKey }> {
  const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    config.tokenMint,
    payer.publicKey,
    false,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );

  const balanceResponse = await connection.getTokenAccountBalance(
    payerTokenAccount.address
  );
  const balance = BigInt(balanceResponse.value.amount);

  return {
    balance,
    formatted: formatTokenAmount(balance, config.decimals),
    account: payerTokenAccount.address,
  };
}

/**
 * Transfer tokens to a recipient
 */
export async function transferTokens(
  connection: Connection,
  payer: Keypair,
  config: Config,
  recipientAddress: string,
  amount: bigint
): Promise<TransferResult> {
  try {
    const recipient = new PublicKey(recipientAddress);

    // Get payer's token account
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      config.tokenMint,
      payer.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Get the expected ATA address for recipient
    const ataAddress = getAssociatedTokenAddressSync(
      config.tokenMint,
      recipient,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Check if account exists
    let accountExists = false;
    try {
      const accountInfo = await connection.getAccountInfo(ataAddress);
      accountExists = accountInfo !== null;
    } catch {
      // Account doesn't exist
    }

    const transaction = new Transaction();

    // If account doesn't exist, add instruction to create it
    if (!accountExists) {
      const createATAInstruction = createAssociatedTokenAccountInstruction(
        payer.publicKey, // payer
        ataAddress, // ata
        recipient, // owner
        config.tokenMint, // mint
        TOKEN_2022_PROGRAM_ID
      );
      transaction.add(createATAInstruction);
    }

    // Add transfer instruction
    const transferInstruction = createTransferInstruction(
      fromTokenAccount.address,
      ataAddress,
      payer.publicKey,
      amount,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    transaction.add(transferInstruction);

    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer],
      { commitment: 'confirmed' }
    );

    return {
      success: true,
      txSignature: signature,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      errorMessage,
    };
  }
}
