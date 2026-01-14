import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
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

/**
 * Extract detailed error information from Solana errors
 */
function extractErrorDetails(error: unknown): string {
  if (error instanceof SendTransactionError) {
    const logs = error.logs;
    const message = error.message;

    // Parse the error for common issues
    let details = message;

    if (logs && logs.length > 0) {
      // Find the most relevant error log
      const errorLog = logs.find(log =>
        log.includes('Error') ||
        log.includes('failed') ||
        log.includes('insufficient')
      );
      if (errorLog) {
        details += ` | Log: ${errorLog}`;
      }
    }

    // Decode common error codes
    if (message.includes('IllegalOwner')) {
      details = 'IllegalOwner: Recipient account is owned by wrong program (possibly a PDA or system account)';
    } else if (message.includes('AccountNotInitialized')) {
      details = 'AccountNotInitialized: On-chain record does not exist';
    } else if (message.includes('InsufficientFunds')) {
      details = 'InsufficientFunds: Not enough tokens or SOL for transaction';
    } else if (message.includes('0x1')) {
      details = 'InsufficientFunds: Token account has insufficient balance';
    } else if (message.includes('0xbc4')) {
      details = 'AccountNotInitialized (0xbc4): Airdrop record PDA not initialized';
    } else if (message.includes('0xbbb')) {
      details = 'AccountDidNotDeserialize (0xbbb): Account data format mismatch';
    }

    return details;
  }

  if (error instanceof Error) {
    const message = error.message;
    const name = error.name;
    const stack = error.stack;

    // If message is empty, try to extract info from name or stack
    if (!message || message === '') {
      if (stack) {
        // Get first meaningful line from stack
        const stackLines = stack.split('\n').filter(l => l.trim());
        const errorType = stackLines[0] || name || 'Error';
        return `${errorType} (no message)`;
      }
      return `${name || 'Error'} (no message)`;
    }

    // Handle timeout/network errors
    if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
      return `Network timeout: ${message}`;
    }
    if (message.includes('socket') || message.includes('ECONNRESET')) {
      return `Connection error: ${message}`;
    }
    if (message.includes('blockhash')) {
      return `Blockhash expired: Transaction took too long, retry needed`;
    }
    if (message.includes('429') || message.includes('Too Many Requests')) {
      return `Rate limited (429): Too many requests, reduce concurrency`;
    }
    if (message.includes('503') || message.includes('Service Unavailable')) {
      return `Service unavailable (503): RPC node overloaded`;
    }

    return message;
  }

  // Handle non-Error objects
  if (error && typeof error === 'object') {
    try {
      const str = JSON.stringify(error, null, 0);
      return str.length > 200 ? str.substring(0, 200) + '...' : str;
    } catch {
      return Object.prototype.toString.call(error);
    }
  }

  return String(error) || 'Unknown error (null/undefined)';
}

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
  simulatedCU?: number;
  computeUnitLimit?: number;
}

/** Multi-token transfer item for a single recipient */
export interface MultiTokenTransferItem {
  recipientAddress: string;
  ethAddress: string;
  xnmAmount: bigint;
  xblkAmount: bigint;
}

export interface MultiTokenBatchResult {
  success: boolean;
  txSignature?: string;
  errorMessage?: string;
  item: MultiTokenTransferItem;
  simulatedCU?: number;
  computeUnitLimit?: number;
}

export interface FeeEstimate {
  fee: bigint;
  feeWithBuffer: bigint;
  unitsConsumed: number;
}

/**
 * Get the payer's token account balance
 */
export async function getPayerBalance(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  tokenProgramId: PublicKey
): Promise<{ balance: bigint; formatted: string; account: PublicKey }> {
  const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    tokenConfig.mint,
    payer.publicKey,
    false,
    undefined,
    undefined,
    tokenProgramId
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

  logger.trace({
    unitsConsumed: simulation.value.unitsConsumed,
    logsLength: simulation.value.logs?.length,
    ...(simulation.value.err && { err: JSON.stringify(simulation.value.err) }),
  }, 'Simulation result');

  if (simulation.value.err) {
    logger.warn(
      { error: simulation.value.err, logs: simulation.value.logs?.slice(-5) },
      'Transaction simulation failed'
    );
  }

  // Get compute units consumed from simulation
  const unitsConsumed = simulation.value.unitsConsumed || 200000;

  // Fee calculation for X1 fork: 10 lamports per compute unit
  const lamportsPerCU = 10;
  const baseFee = BigInt(unitsConsumed * lamportsPerCU);
  const feeWithBuffer = BigInt(
    Math.ceil(Number(baseFee) * feeBufferMultiplier)
  );

  logger.trace({
    unitsConsumed,
    baseFee: baseFee.toString(),
    feeWithBuffer: feeWithBuffer.toString(),
  }, 'Fee calculation');

  return {
    fee: baseFee,
    feeWithBuffer,
    unitsConsumed,
  };
}

/**
 * Transfer tokens to a recipient
 */
export async function transferTokens(
  connection: Connection,
  payer: Keypair,
  tokenConfig: TokenConfig,
  tokenProgramId: PublicKey,
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
      tokenProgramId
    );

    // Get the expected ATA address for recipient
    const ataAddress = getAssociatedTokenAddressSync(
      tokenConfig.mint,
      recipient,
      true, // allowOwnerOffCurve - support PDA recipients
      tokenProgramId
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
        tokenProgramId
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
      tokenProgramId
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
  tokenProgramId: PublicKey,
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
      tokenProgramId
    );

    // Get all recipient ATAs and check existence in batch
    const recipients = items.map(
      (item) => new PublicKey(item.recipientAddress)
    );
    const ataAddresses = recipients.map((recipient) =>
      getAssociatedTokenAddressSync(
        tokenConfig.mint,
        recipient,
        true, // allowOwnerOffCurve - support PDA recipients
        tokenProgramId
      )
    );

    // Batch check which accounts exist
    const accountInfos = await connection.getMultipleAccountsInfo(ataAddresses);
    const atasToCreate = accountInfos.filter(info => !info).length;

    const transaction = new Transaction();

    // Add ATA creation instructions for accounts that don't exist
    for (let i = 0; i < items.length; i++) {
      if (!accountInfos[i]) {
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          payer.publicKey,
          ataAddresses[i],
          recipients[i],
          tokenConfig.mint,
          tokenProgramId
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
        tokenProgramId
      );
      transaction.add(transferInstruction);
    }

    // Add on-chain record update instructions
    for (const instruction of recordUpdateInstructions) {
      transaction.add(instruction);
    }

    logger.trace({
      atasToCreate,
      transfers: items.length,
      recordInstructions: recordUpdateInstructions.length,
      totalInstructions: transaction.instructions.length,
    }, 'Building transaction');

    // Simulate and estimate fee
    const feeEstimate = await simulateAndEstimateFee(
      connection,
      transaction,
      payer,
      feeBufferMultiplier
    );

    // Set compute unit limit based on simulation (add 10% buffer)
    const computeUnitLimit = Math.min(
      Math.ceil(feeEstimate.unitsConsumed * 1.1),
      1_400_000
    );

    const priorityFee = parseInt(process.env.PRIORITY_FEE || '1000', 10);
    const estimatedPriorityFee = (computeUnitLimit * priorityFee) / 1_000_000;

    logger.debug(
      {
        simulatedCU: feeEstimate.unitsConsumed,
        computeUnitLimit,
        priorityFeeMicroLamports: priorityFee,
        estimatedPriorityFeeLamports: estimatedPriorityFee,
      },
      'Transaction compute budget'
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

    // Rebuild transaction with compute budget instructions
    const finalTransaction = new Transaction();

    // Set compute unit limit based on simulation
    finalTransaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit })
    );

    // Set priority fee (microlamports per compute unit)
    // Default to 1000 microlamports = 0.000001 SOL per 1000 CU
    finalTransaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
    );

    // Add all original instructions
    for (const ix of transaction.instructions) {
      finalTransaction.add(ix);
    }

    // Get fresh blockhash and send transaction
    const { blockhash } = await connection.getLatestBlockhash();
    finalTransaction.recentBlockhash = blockhash;
    finalTransaction.feePayer = payer.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      finalTransaction,
      [payer],
      { commitment: 'confirmed' }
    );

    return {
      success: true,
      txSignature: signature,
      items,
      estimatedFee: feeEstimate.feeWithBuffer,
      simulatedCU: feeEstimate.unitsConsumed,
      computeUnitLimit,
    };
  } catch (error) {
    const errorMessage = extractErrorDetails(error);
    // Log full error details at debug level for troubleshooting
    logger.debug({
      errorMessage,
      errorType: error?.constructor?.name,
      errorName: error instanceof Error ? error.name : undefined,
      errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' | ') : undefined,
      rawError: error instanceof Error ? undefined : error,
    }, 'Batch transfer error details');
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
  tokenProgramId: PublicKey,
  totalRecipients: number,
  existingRecordCount: number,
  batchSize: number,
  feeBufferMultiplier: number
): Promise<{ totalFee: bigint; perBatchFee: bigint; numBatches: number }> {
  // Calculate how many new ATAs we expect to create
  // Recipients with existing records already have ATAs from prior airdrops
  const newRecipients = totalRecipients - existingRecordCount;
  const ataCreationRatio = totalRecipients > 0 ? newRecipients / totalRecipients : 1;
  const expectedAtasPerBatch = Math.ceil(batchSize * ataCreationRatio);

  logger.trace({
    totalRecipients,
    existingRecordCount,
    newRecipients,
    ataCreationRatio: ataCreationRatio.toFixed(2),
    expectedAtasPerBatch,
  }, 'Fee estimation parameters');

  // Create a sample transaction with realistic ATA creation count
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
    tokenProgramId
  );

  // Use payer's existing ATA as dummy for estimation (no creation needed)
  const dummyAta = getAssociatedTokenAddressSync(
    tokenConfig.mint,
    payer.publicKey,
    false,
    tokenProgramId
  );

  // Add transfer instructions for batch size
  // We estimate CU based on transfers only - ATA creation adds ~5000 CU each
  for (let i = 0; i < batchSize; i++) {
    const transferInstruction = createTransferInstruction(
      fromTokenAccount.address,
      dummyAta,
      payer.publicKey,
      1n,
      [],
      tokenProgramId
    );
    sampleTransaction.add(transferInstruction);
  }

  // Add estimated CU for ATA creations (can't simulate creating same ATA multiple times)
  const ataCreationCU = expectedAtasPerBatch * 5000;

  // Estimate fee for this sample batch
  const feeEstimate = await simulateAndEstimateFee(
    connection,
    sampleTransaction,
    payer,
    feeBufferMultiplier
  );

  // Add ATA creation CU to the estimate
  const totalCU = feeEstimate.unitsConsumed + ataCreationCU;
  const lamportsPerCU = 10;
  const perBatchFee = BigInt(Math.ceil(totalCU * lamportsPerCU * feeBufferMultiplier));

  const numBatches = Math.ceil(totalRecipients / batchSize);
  const totalFee = perBatchFee * BigInt(numBatches);

  return {
    totalFee,
    perBatchFee,
    numBatches,
  };
}

/**
 * Transfer multiple tokens to a single recipient in one transaction
 * Includes both token transfers and record update instructions
 */
export async function multiTokenTransfer(
  connection: Connection,
  payer: Keypair,
  xnmConfig: TokenConfig,
  xblkConfig: TokenConfig,
  tokenProgramId: PublicKey,
  item: MultiTokenTransferItem,
  recordUpdateInstructions: TransactionInstruction[],
  feeBufferMultiplier: number = 1.2
): Promise<MultiTokenBatchResult> {
  try {
    const recipient = new PublicKey(item.recipientAddress);
    const transaction = new Transaction();

    // Get payer's token accounts
    const xnmFromAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      xnmConfig.mint,
      payer.publicKey,
      false,
      undefined,
      undefined,
      tokenProgramId
    );

    const xblkFromAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      xblkConfig.mint,
      payer.publicKey,
      false,
      undefined,
      undefined,
      tokenProgramId
    );

    // Get recipient ATAs
    const xnmAta = getAssociatedTokenAddressSync(
      xnmConfig.mint,
      recipient,
      true, // allowOwnerOffCurve
      tokenProgramId
    );

    const xblkAta = getAssociatedTokenAddressSync(
      xblkConfig.mint,
      recipient,
      true, // allowOwnerOffCurve
      tokenProgramId
    );

    // Check which ATAs exist
    const [xnmAtaInfo, xblkAtaInfo] = await connection.getMultipleAccountsInfo([xnmAta, xblkAta]);

    // Create XNM ATA if needed and we have XNM to transfer
    if (!xnmAtaInfo && item.xnmAmount > 0n) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          xnmAta,
          recipient,
          xnmConfig.mint,
          tokenProgramId
        )
      );
    }

    // Create XBLK ATA if needed and we have XBLK to transfer
    if (!xblkAtaInfo && item.xblkAmount > 0n) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          xblkAta,
          recipient,
          xblkConfig.mint,
          tokenProgramId
        )
      );
    }

    // Add XNM transfer if amount > 0
    if (item.xnmAmount > 0n) {
      transaction.add(
        createTransferInstruction(
          xnmFromAccount.address,
          xnmAta,
          payer.publicKey,
          item.xnmAmount,
          [],
          tokenProgramId
        )
      );
    }

    // Add XBLK transfer if amount > 0
    if (item.xblkAmount > 0n) {
      transaction.add(
        createTransferInstruction(
          xblkFromAccount.address,
          xblkAta,
          payer.publicKey,
          item.xblkAmount,
          [],
          tokenProgramId
        )
      );
    }

    // Add record update instructions
    for (const instruction of recordUpdateInstructions) {
      transaction.add(instruction);
    }

    logger.trace({
      xnmAtaExists: !!xnmAtaInfo,
      xblkAtaExists: !!xblkAtaInfo,
      xnmTransfer: item.xnmAmount > 0n,
      xblkTransfer: item.xblkAmount > 0n,
      recordInstructions: recordUpdateInstructions.length,
      totalInstructions: transaction.instructions.length,
    }, 'Building multi-token transaction');

    // Simulate and estimate fee
    const feeEstimate = await simulateAndEstimateFee(
      connection,
      transaction,
      payer,
      feeBufferMultiplier
    );

    // Set compute unit limit based on simulation (add 10% buffer)
    const computeUnitLimit = Math.min(
      Math.ceil(feeEstimate.unitsConsumed * 1.1),
      1_400_000
    );

    const priorityFee = parseInt(process.env.PRIORITY_FEE || '1000', 10);

    logger.debug({
      simulatedCU: feeEstimate.unitsConsumed,
      computeUnitLimit,
      priorityFeeMicroLamports: priorityFee,
    }, 'Multi-token transaction compute budget');

    // Rebuild transaction with compute budget instructions
    const finalTransaction = new Transaction();

    finalTransaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit })
    );

    finalTransaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
    );

    // Add all original instructions
    for (const ix of transaction.instructions) {
      finalTransaction.add(ix);
    }

    // Get fresh blockhash and send transaction
    const { blockhash } = await connection.getLatestBlockhash();
    finalTransaction.recentBlockhash = blockhash;
    finalTransaction.feePayer = payer.publicKey;

    const signature = await sendAndConfirmTransaction(
      connection,
      finalTransaction,
      [payer],
      { commitment: 'confirmed' }
    );

    return {
      success: true,
      txSignature: signature,
      item,
      simulatedCU: feeEstimate.unitsConsumed,
      computeUnitLimit,
    };
  } catch (error) {
    const errorMessage = extractErrorDetails(error);
    logger.debug({
      errorMessage,
      errorType: error?.constructor?.name,
      recipient: item.recipientAddress,
    }, 'Multi-token transfer error');
    return {
      success: false,
      errorMessage,
      item,
    };
  }
}
