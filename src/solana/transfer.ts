import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { TokenConfig } from '../config.js';
import { formatTokenAmount } from '../utils/format.js';
import logger from '../utils/logger.js';

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
  estimatedFee?: bigint;
}

export interface FeeEstimate {
  fee: bigint;
  feeWithBuffer: bigint;
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
    config.tokenProgramId
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
 * Simulate a transaction and estimate the fee
 */
export async function simulateAndEstimateFee(
  connection: Connection,
  transaction: Transaction,
  payer: Keypair,
  feeBufferMultiplier: number
): Promise<FeeEstimate> {
  // Get latest blockhash for simulation
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = payer.publicKey;

  // Create a versioned transaction for simulation
  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: transaction.instructions,
  }).compileToV0Message();

  const versionedTx = new VersionedTransaction(messageV0);

  // Simulate to get compute units used
  const simulation = await connection.simulateTransaction(versionedTx, {
    sigVerify: false,
  });

  if (simulation.value.err) {
    logger.warn(
      { error: simulation.value.err },
      'Transaction simulation failed'
    );
  }

  // Get the fee for the transaction
  const fee = await connection.getFeeForMessage(messageV0);

  if (fee.value === null) {
    throw new Error('Failed to estimate transaction fee');
  }

  const baseFee = BigInt(fee.value);
  const feeWithBuffer = BigInt(
    Math.ceil(Number(baseFee) * feeBufferMultiplier)
  );

  return {
    fee: baseFee,
    feeWithBuffer,
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
      config.tokenProgramId
    );

    // Get the expected ATA address for recipient
    const ataAddress = getAssociatedTokenAddressSync(
      tokenConfig.mint,
      recipient,
      false,
      config.tokenProgramId
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
        config.tokenProgramId
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
      config.tokenProgramId
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
 * Simulates the transaction first to estimate fees
 */
export async function batchTransferTokens(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  items: BatchTransferItem[],
  recordUpdateInstructions: TransactionInstruction[],
  feeBufferMultiplier: number = 1.2
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
    const recipients = items.map(
      (item) => new PublicKey(item.recipientAddress)
    );
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

    // Simulate and estimate fee
    const feeEstimate = await simulateAndEstimateFee(
      connection,
      transaction,
      payer,
      feeBufferMultiplier
    );

    logger.debug(
      {
        baseFee: feeEstimate.fee.toString(),
        feeWithBuffer: feeEstimate.feeWithBuffer.toString(),
        bufferMultiplier: feeBufferMultiplier,
      },
      'Transaction fee estimated'
    );

    // Check if payer has enough for fees
    const payerBalance = await connection.getBalance(payer.publicKey);
    if (BigInt(payerBalance) < feeEstimate.feeWithBuffer) {
      return {
        success: false,
        errorMessage: `Insufficient balance for fees: have ${payerBalance} lamports, need ${feeEstimate.feeWithBuffer} lamports`,
        items,
        estimatedFee: feeEstimate.feeWithBuffer,
      };
    }

    // Get fresh blockhash and send transaction
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = payer.publicKey;

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
      estimatedFee: feeEstimate.feeWithBuffer,
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

/**
 * Estimate total fees for all batches
 */
export async function estimateTotalFees(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  totalRecipients: number,
  batchSize: number,
  recordInstructionsPerBatch: number,
  feeBufferMultiplier: number
): Promise<{ totalFee: bigint; perBatchFee: bigint; numBatches: number }> {
  // Create a sample transaction with batchSize transfers to estimate per-batch fee
  const sampleTransaction = new Transaction();

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

  // Add sample ATA creation and transfer instructions
  // Assume worst case: all ATAs need to be created
  for (let i = 0; i < batchSize; i++) {
    // Use payer's address as dummy recipient for estimation
    const dummyAta = getAssociatedTokenAddressSync(
      tokenConfig.mint,
      payer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Add transfer instruction (ATA creation adds significant cost)
    const transferInstruction = createTransferInstruction(
      fromTokenAccount.address,
      dummyAta,
      payer.publicKey,
      1n,
      [],
      TOKEN_2022_PROGRAM_ID
    );
    sampleTransaction.add(transferInstruction);
  }

  // Estimate fee for this sample batch
  const feeEstimate = await simulateAndEstimateFee(
    connection,
    sampleTransaction,
    payer,
    feeBufferMultiplier
  );

  const numBatches = Math.ceil(totalRecipients / batchSize);
  const totalFee = feeEstimate.feeWithBuffer * BigInt(numBatches);

  return {
    totalFee,
    perBatchFee: feeEstimate.feeWithBuffer,
    numBatches,
  };
}
