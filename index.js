import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// ===== CONFIGURATION =====
function loadConfig() {
  const requiredVars = ["TOKEN_MINT", "RPC_ENDPOINT", "KEYPAIR_PATH"];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  return {
    tokenMint: new PublicKey(process.env.TOKEN_MINT),
    rpcEndpoint: process.env.RPC_ENDPOINT,
    decimals: parseInt(process.env.DECIMALS || "6"),
    dryRun: process.env.DRY_RUN === "true",
    logFile: process.env.LOG_FILE || "./airdrop-log.json",
    failFile: process.env.FAIL_FILE || "./airdrop-failures.json",
    keypairPath: process.env.KEYPAIR_PATH,
    apiEndpoint:
      process.env.API_ENDPOINT ||
      "https://xenblocks.io/v1/leaderboard?limit=10000&require_sol_address=true",
  };
}

const config = loadConfig();

// ===== BLOCKCHAIN SETUP =====
const connection = new Connection(config.rpcEndpoint, "confirmed");
const payer = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(config.keypairPath))),
);

// ===== STATE MANAGEMENT =====
class AirdropState {
  constructor() {
    this.successLog = this.loadLog(config.logFile);
    this.failureLog = this.loadLog(config.failFile);
  }

  loadLog(filePath) {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath));
    }
    return {};
  }

  saveLogs() {
    fs.writeFileSync(config.logFile, JSON.stringify(this.successLog, null, 2));
    fs.writeFileSync(config.failFile, JSON.stringify(this.failureLog, null, 2));
  }

  alreadyAirdropped(address) {
    return !!this.successLog[address];
  }

  logSuccess(address, txid, amount) {
    this.successLog[address] = {
      txid,
      amount,
      timestamp: new Date().toISOString(),
    };
    this.saveLogs();
  }

  logFailure(address, error) {
    this.failureLog[address] = {
      error,
      timestamp: new Date().toISOString(),
    };
    this.saveLogs();
  }
}

const state = new AirdropState();

// ===== UTILITY FUNCTIONS =====
function convertApiAmountToTokenAmount(apiAmount) {
  // API returns amounts with 18 decimals in scientific notation
  // Example: "1.351984E+25" means 13,519,840,000,000,000,000,000,000 (smallest units)
  // Token on X1 uses 9 decimals, so we divide by 10^9

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
    return BigInt(integerPart || '0') / BigInt(10 ** 9);
  }
}

function formatTokenAmount(amount) {
  // Keep precision by handling BigInt directly
  const divisor = BigInt(10 ** config.decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;

  // Pad fractional part with leading zeros if needed
  const fractionalStr = fractionalPart.toString().padStart(config.decimals, '0');

  // Remove trailing zeros for cleaner display
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  if (trimmedFractional === '') {
    return wholePart.toString();
  }
  return `${wholePart}.${trimmedFractional}`;
}

// ===== API FUNCTIONS =====
async function fetchMinersFromAPI() {
  console.log("📡 Fetching miner data from API...");
  const response = await fetch(config.apiEndpoint);
  const data = await response.json();

  const validMiners = data.miners.filter(
    (miner) => miner.solAddress && miner.xnm,
  );

  console.log(`✅ Found ${validMiners.length} valid miners`);
  return validMiners;
}

// ===== BALANCE CHECKING =====
async function checkPayerBalance() {
  try {
    console.log(`🔍 Checking balance for payer: ${payer.publicKey.toString()}`);
    console.log(`🪙 Token mint: ${config.tokenMint.toString()}`);

    const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      config.tokenMint,
      payer.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );

    console.log(`📋 Token account: ${payerTokenAccount.address.toString()}`);

    const balanceResponse = await connection.getTokenAccountBalance(
      payerTokenAccount.address,
    );
    const balance = BigInt(balanceResponse.value.amount);

    return {
      account: payerTokenAccount,
      balance,
      formatted: formatTokenAmount(balance),
    };
  } catch (error) {
    console.error(`❌ Balance check error details:`, error);
    throw new Error(`Failed to check payer balance: ${error.message}`);
  }
}

async function calculateTotalNeeded(miners) {
  let totalNeeded = 0n;
  let skippedCount = 0;

  for (const miner of miners) {
    if (!state.alreadyAirdropped(miner.solAddress)) {
      const amount = convertApiAmountToTokenAmount(miner.xnm);
      totalNeeded += amount;
    } else {
      skippedCount++;
    }
  }

  return { totalNeeded, skippedCount };
}

// ===== AIRDROP EXECUTION =====
async function executeAirdrop(miners, payerBalance) {
  console.log("\\n🚀 Starting airdrop execution...");

  for (const miner of miners) {
    const recipientAddress = miner.solAddress;
    const ethAddress = miner.account;
    const tokenAmount = convertApiAmountToTokenAmount(miner.xnm);
    const humanAmount = formatTokenAmount(tokenAmount);

    // Skip if no amount or already airdropped
    if (tokenAmount === 0n) continue;
    if (state.alreadyAirdropped(recipientAddress)) {
      console.log(`⏭️  ${recipientAddress}: Already airdropped`);
      continue;
    }

    try {
      await transferTokensToRecipient(
        recipientAddress,
        ethAddress,
        tokenAmount,
        humanAmount,
      );
    } catch (error) {
      const errorMsg = error.message || error.toString() || 'Unknown error';
      console.error(`❌ ${recipientAddress} (${ethAddress}): ${errorMsg}`);

      // Log more details for debugging
      if (error.logs) {
        console.error(`   Transaction logs:`, error.logs);
      }
      if (error.message && error.message.includes("insufficient funds")) {
        console.error(
          `   💸 Need ${humanAmount} XNM but balance may be too low`,
        );
      }
      if (error.message && error.message.includes("0x1")) {
        console.error(`   ℹ️  This usually means the recipient needs a token account created first`);
      }

      state.logFailure(recipientAddress, errorMsg);
    }
  }
}

async function transferTokensToRecipient(
  recipientAddress,
  ethAddress,
  amount,
  humanAmount,
) {
  if (config.dryRun) {
    console.log(
      `🧪 [DRY RUN] Would send ${humanAmount} XNM to ${recipientAddress} (ETH: ${ethAddress})`,
    );
    return;
  }

  const recipient = new PublicKey(recipientAddress);

  // Get or create token accounts
  let fromTokenAccount, toTokenAccount;

  try {
    fromTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      config.tokenMint,
      payer.publicKey,
      false,
      undefined,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );
  } catch (error) {
    console.error(`❌ Failed to get payer token account:`, error.message);
    throw error;
  }

  // Get the expected ATA address
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
  } catch (e) {
    // Account doesn't exist
  }

  let transaction = new Transaction();

  // If account doesn't exist, add instruction to create it
  if (!accountExists) {
    console.log(`   📝 Creating ATA for ${recipientAddress}...`);
    const createATAInstruction = createAssociatedTokenAccountInstruction(
      payer.publicKey,    // payer
      ataAddress,         // ata
      recipient,          // owner
      config.tokenMint,   // mint
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
    TOKEN_2022_PROGRAM_ID,
  );
  transaction.add(transferInstruction);

  // Send transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer],
    { commitment: "confirmed" },
  );

  console.log(
    `✅ ${recipientAddress} (ETH: ${ethAddress}): ${humanAmount} XNM sent | Tx: ${signature}`,
  );
  state.logSuccess(recipientAddress, signature, Number(amount));
}

// ===== MAIN EXECUTION =====
async function runAirdrop() {
  try {
    console.log("\\n🎯 XNM Airdrop Starting...");
    console.log(`📋 Mode: ${config.dryRun ? "DRY RUN" : "LIVE EXECUTION"}`);
    console.log(`🔧 DRY_RUN env var: "${process.env.DRY_RUN}"`);

    // Fetch miners and check balance
    const miners = await fetchMinersFromAPI();
    const payerInfo = await checkPayerBalance();
    const { totalNeeded, skippedCount } = await calculateTotalNeeded(miners);

    // Display summary
    console.log(`\\n💰 Payer balance: ${payerInfo.formatted} XNM`);
    console.log(`📊 Total miners: ${miners.length}`);
    console.log(`💸 Total needed: ${formatTokenAmount(totalNeeded)} XNM`);
    console.log(`⏭️  Already completed: ${skippedCount} addresses`);

    if (totalNeeded > payerInfo.balance) {
      const shortfall = formatTokenAmount(totalNeeded - payerInfo.balance);
      console.log(
        `\\n⚠️  WARNING: Insufficient balance! Need ${shortfall} more XNM`,
      );
      if (!config.dryRun) {
        console.log("❌ Stopping execution due to insufficient funds");
        return;
      }
    }

    // Execute the airdrop
    await executeAirdrop(miners, payerInfo.balance);

    console.log("\\n🎉 Airdrop completed successfully!");
  } catch (error) {
    console.error("💥 Airdrop failed:", error.message);
    process.exit(1);
  }
}

// Start the airdrop
runAirdrop();
