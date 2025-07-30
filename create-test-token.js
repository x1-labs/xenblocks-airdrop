import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";

// Config
const RPC_ENDPOINT = "https://rpc.testnet.x1.xyz";
const DECIMALS = 6;
const AMOUNT_TO_MINT = 1_000_000_000; // 1 billion tokens (before decimals)
const KEYPAIR_PATH = `${process.env.HOME}/.config/solana/solzen-deplorer.json`;

async function createTestToken() {
  // Load payer keypair
  let payer;
  try {
    payer = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH))),
    );
  } catch (err) {
    console.error("❌ Error loading payer keypair:", err.message);
    console.log("\nPlease create a payer keypair first:");
    console.log("solana-keygen new --outfile ./payer-keypair.json");
    process.exit(1);
  }

  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  console.log("🔑 Payer address:", payer.publicKey.toString());

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log("💰 Balance:", balance / 1e9, "SOL");

  if (balance < 0.01 * 1e9) {
    console.error("❌ Insufficient balance. You need at least 0.01 SOL");
    console.log("\nGet testnet SOL from: https://faucet.testnet.x1.xyz/");
    process.exit(1);
  }

  // Generate new mint keypair
  const mintKeypair = Keypair.generate();
  console.log("\n🪙 Creating token mint:", mintKeypair.publicKey.toString());

  try {
    // Calculate rent
    const lamports =
      await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

    // Create a mint account
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    });

    // Initialize mint
    const initMintIx = createInitializeMintInstruction(
      mintKeypair.publicKey,
      DECIMALS,
      payer.publicKey, // mint authority
      payer.publicKey, // freeze authority
      TOKEN_PROGRAM_ID,
    );

    // Get the associated token account address
    const associatedTokenAccount = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      payer.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    // Create an associated token account
    const createATAIx = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedTokenAccount,
      payer.publicKey,
      mintKeypair.publicKey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    // Mint tokens
    const mintAmount = BigInt(AMOUNT_TO_MINT) * BigInt(10 ** DECIMALS);
    const mintToIx = createMintToInstruction(
      mintKeypair.publicKey,
      associatedTokenAccount,
      payer.publicKey,
      mintAmount,
      [],
      TOKEN_PROGRAM_ID,
    );

    // Create and send transaction
    const tx = new Transaction().add(
      createAccountIx,
      initMintIx,
      createATAIx,
      mintToIx,
    );

    const sig = await sendAndConfirmTransaction(
      connection,
      tx,
      [payer, mintKeypair],
      { commitment: "confirmed" },
    );

    console.log("\n✅ Token created and minted!");
    console.log("📝 Transaction:", sig);
    console.log("🪙 Token mint:", mintKeypair.publicKey.toString());
    console.log("💼 Token account:", associatedTokenAccount.toString());
    console.log("📊 Amount minted:", AMOUNT_TO_MINT.toLocaleString(), "tokens");

    // Save mint info
    const mintInfo = {
      mint: mintKeypair.publicKey.toString(),
      decimals: DECIMALS,
      mintAuthority: payer.publicKey.toString(),
      supply: AMOUNT_TO_MINT,
      tokenAccount: associatedTokenAccount.toString(),
      createdAt: new Date().toISOString(),
      transaction: sig,
    };

    fs.writeFileSync(
      "./test-token-info.json",
      JSON.stringify(mintInfo, null, 2),
    );
    console.log("\n💾 Token info saved to test-token-info.json");

    // Update index.js with the new mint
    console.log("\n📝 Update TOKEN_MINT in index.js to:");
    console.log(
      `const TOKEN_MINT = new PublicKey('${mintKeypair.publicKey.toString()}');`,
    );
  } catch (err) {
    console.error("\n❌ Error creating token:", err.message);
    if (err.logs) {
      console.log("\nTransaction logs:");
      err.logs.forEach((log) => console.log(log));
    }
  }
}

createTestToken();
