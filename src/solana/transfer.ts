import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { TokenConfig } from '../config.js';
import { formatTokenAmount } from '../utils/format.js';

export interface TransferResult {
  success: boolean;
  txSignature?: string;
  errorMessage?: string;
}

export interface BatchTransferItem {
  recipientAddress: string;
  ethAddress: string;
  amount: bigint;
}

export interface BatchTransferResult {
  success: boolean;
  txSignature?: string;
  errorMessage?: string;
  items: BatchTransferItem[];
}

/**
 * Get the payer's token account balance
 */
export async function getPayerBalance(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig
): Promise<{ balance: bigint; formatted: string; account: PublicKey }> {
  const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    tokenConfig.mint,
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
    formatted: formatTokenAmount(balance, tokenConfig.decimals),
    account: payerTokenAccount.address,
  };
}

/**
 * Transfer tokens to a recipient
 */
export async function transferTokens(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  recipientAddress: string,
  amount: bigint
): Promise<TransferResult> {
  try {
    const recipient = new PublicKey(recipientAddress);

    // Get payer's token account
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tokenConfig.mint,
      payer.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Get the expected ATA address for recipient
    const ataAddress = getAssociatedTokenAddressSync(
      tokenConfig.mint,
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
        tokenConfig.mint, // mint
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

/**
 * Transfer tokens to multiple recipients in a single transaction
 * Also includes on-chain record update instructions
 */
export async function batchTransferTokens(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  items: BatchTransferItem[],
  recordUpdateInstructions: TransactionInstruction[]
): Promise<BatchTransferResult> {
  try {
    if (items.length === 0) {
      return {
        success: true,
        items: [],
      };
    }

    // Get payer's token account
    const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tokenConfig.mint,
      payer.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    // Get all recipient ATAs and check existence in batch
    const recipients = items.map((item) => new PublicKey(item.recipientAddress));
    const ataAddresses = recipients.map((recipient) =>
      getAssociatedTokenAddressSync(
        tokenConfig.mint,
        recipient,
        false,
        TOKEN_2022_PROGRAM_ID
      )
    );

    // Batch check which accounts exist
    const accountInfos = await connection.getMultipleAccountsInfo(ataAddresses);

    const transaction = new Transaction();

    // Add ATA creation instructions for accounts that don't exist
    for (let i = 0; i < items.length; i++) {
      if (!accountInfos[i]) {
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          payer.publicKey,
          ataAddresses[i],
          recipients[i],
          tokenConfig.mint,
          TOKEN_2022_PROGRAM_ID
        );
        transaction.add(createATAInstruction);
      }
    }

    // Add transfer instructions
    for (let i = 0; i < items.length; i++) {
      const transferInstruction = createTransferInstruction(
        fromTokenAccount.address,
        ataAddresses[i],
        payer.publicKey,
        items[i].amount,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      transaction.add(transferInstruction);
    }

    // Add on-chain record update instructions
    for (const instruction of recordUpdateInstructions) {
      transaction.add(instruction);
    }

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
      items,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      errorMessage,
      items,
    };
  }
}
