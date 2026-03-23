import { Connection, PublicKey } from "@solana/web3.js";
import { FetchOptions } from "../adapters/types";

const PROGRAM_ID = "omnixgS8fnqHfCcTGKWj6JtKjzpJZ1Y5y9pyFkQDkYE";
const RPC_URL = process.env.SOLANA_RPC;

if (!RPC_URL) {
  throw new Error("Missing SOLANA_RPC in environment");
}

const bs58mod = require("bs58");
const bs58 = bs58mod.default ?? bs58mod;

const SWAP_DISC = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);
const SWAP_EVENT_DISC = Buffer.from([64, 198, 205, 232, 38, 8, 113, 226]);

const SIGNATURE_PAGE_SIZE = 25;
const TX_RETRY_ATTEMPTS = 7;
const INITIAL_RETRY_DELAY_MS = 1500;
const PER_TX_DELAY_MS = 200;
const DEBUG_OMNIPAIR = process.env.DEBUG_OMNIPAIR === "true";

export type OmnipairSwapRow = {
  txSignature: string;
  blockTime: number | null;
  slot: string;
  pairAddress: string;
  userAddress: string;
  tokenInMint: string;
  tokenOutMint: string;
  tokenInVault: string;
  tokenOutVault: string;
  userTokenInAccount: string;
  userTokenOutAccount: string;
  amountIn: string;
  minAmountOut: string;
  amountOut: string;
  amountInAfterFee: string;
  lpFee: string;
  protocolFee: string;
  isToken0In: boolean;
};

type SwapArgs = {
  amountIn: string;
  minAmountOut: string;
};

type SwapEvent = {
  reserve0: string;
  reserve1: string;
  isToken0In: boolean;
  amountIn: string;
  amountOut: string;
  amountInAfterFee: string;
  lpFee: string;
  protocolFee: string;
  signer: string;
  pair: string;
  slot: string;
};

type SignatureInfo = {
  signature: string;
  blockTime: number | null;
  err: any;
};

type OmnipairDebugStats = {
  signaturesFetched: number;
  signaturesSkippedFailed: number;
  txFetchAttempts: number;
  txFetchSucceeded: number;
  txFetchReturnedNull: number;
  txFetchErrors: number;
  rateLimitRetries: number;
  txProgramFailures: number;
  txsWithNoSwapData: number;
  totalSwapInstructions: number;
  totalSwapEvents: number;
  decodedRows: number;
};

function createDebugStats(): OmnipairDebugStats {
  return {
    signaturesFetched: 0,
    signaturesSkippedFailed: 0,
    txFetchAttempts: 0,
    txFetchSucceeded: 0,
    txFetchReturnedNull: 0,
    txFetchErrors: 0,
    rateLimitRetries: 0,
    txProgramFailures: 0,
    txsWithNoSwapData: 0,
    totalSwapInstructions: 0,
    totalSwapEvents: 0,
    decodedRows: 0,
  };
}

function logDebugStats(stats: OmnipairDebugStats) {
  console.log("omnipair debug stats:");
  console.log(`- signatures fetched: ${stats.signaturesFetched}`);
  console.log(`- signatures skipped failed: ${stats.signaturesSkippedFailed}`);
  console.log(`- tx fetch attempts: ${stats.txFetchAttempts}`);
  console.log(`- tx fetch succeeded: ${stats.txFetchSucceeded}`);
  console.log(`- tx fetch returned null: ${stats.txFetchReturnedNull}`);
  console.log(`- tx fetch errors: ${stats.txFetchErrors}`);
  console.log(`- rate limit retries: ${stats.rateLimitRetries}`);
  console.log(`- tx program failures: ${stats.txProgramFailures}`);
  console.log(`- txs with no swap data: ${stats.txsWithNoSwapData}`);
  console.log(`- total swap instructions: ${stats.totalSwapInstructions}`);
  console.log(`- total swap events: ${stats.totalSwapEvents}`);
  console.log(`- decoded rows: ${stats.decodedRows}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readU64LE(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

function readBool(buf: Buffer, offset: number): boolean {
  return buf.readUInt8(offset) !== 0;
}

function readPubkey(buf: Buffer, offset: number): string {
  return new PublicKey(buf.subarray(offset, offset + 32)).toBase58();
}

function startsWithDiscriminator(buf: Buffer, disc: Buffer): boolean {
  return buf.length >= disc.length && buf.subarray(0, disc.length).equals(disc);
}

function decodeIxData(data: string): Buffer {
  return Buffer.from(bs58.decode(data));
}

function decodeSwapArgs(buf: Buffer): SwapArgs {
  return {
    amountIn: readU64LE(buf, 8).toString(),
    minAmountOut: readU64LE(buf, 16).toString(),
  };
}

function decodeSwapEvent(buf: Buffer): SwapEvent {
  return {
    reserve0: readU64LE(buf, 8).toString(),
    reserve1: readU64LE(buf, 16).toString(),
    isToken0In: readBool(buf, 24),
    amountIn: readU64LE(buf, 25).toString(),
    amountOut: readU64LE(buf, 33).toString(),
    amountInAfterFee: readU64LE(buf, 41).toString(),
    lpFee: readU64LE(buf, 49).toString(),
    protocolFee: readU64LE(buf, 57).toString(),
    signer: readPubkey(buf, 65),
    pair: readPubkey(buf, 97),
    slot: readU64LE(buf, 129).toString(),
  };
}

function txFailedForOmnipair(logs: string[]): boolean {
  return logs.some(
    (l) =>
      l.includes(`Program ${PROGRAM_ID} failed:`) ||
      l.includes("AnchorError thrown in programs/omnipair/")
  );
}

function isRateLimitError(error: any): boolean {
  const msg = String(error?.message ?? error ?? "");
  return msg.includes("429") || msg.toLowerCase().includes("too many requests");
}

async function getTransactionWithRetry(
  connection: Connection,
  signature: string,
  stats: OmnipairDebugStats,
  attempts = TX_RETRY_ATTEMPTS
) {
  let delay = INITIAL_RETRY_DELAY_MS;
  stats.txFetchAttempts += 1;

  for (let i = 0; i < attempts; i++) {
    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });

      if (tx) {
        stats.txFetchSucceeded += 1;
      } else {
        stats.txFetchReturnedNull += 1;
      }

      return tx;
    } catch (error) {
      if (isRateLimitError(error)) {
        stats.rateLimitRetries += 1;
      }

      if (i === attempts - 1 || !isRateLimitError(error)) {
        stats.txFetchErrors += 1;
        throw error;
      }

      await sleep(delay);
      delay *= 2;
    }
  }

  stats.txFetchReturnedNull += 1;
  return null;
}

async function getSignaturesForAddressWithRetry(
  connection: Connection,
  programId: PublicKey,
  before: string | undefined,
  stats: OmnipairDebugStats,
  attempts = TX_RETRY_ATTEMPTS
) {
  let delay = INITIAL_RETRY_DELAY_MS;

  for (let i = 0; i < attempts; i++) {
    try {
      return await connection.getSignaturesForAddress(programId, {
        limit: SIGNATURE_PAGE_SIZE,
        before,
      });
    } catch (error) {
      if (isRateLimitError(error)) {
        stats.rateLimitRetries += 1;
      }

      if (i === attempts - 1 || !isRateLimitError(error)) {
        throw error;
      }

      await sleep(delay);
      delay *= 2;
    }
  }

  return [];
}

async function collectInWindowSignatures(
  connection: Connection,
  programId: PublicKey,
  options: FetchOptions,
  stats: OmnipairDebugStats
): Promise<SignatureInfo[]> {
  let before: string | undefined = undefined;
  let reachedStartBoundary = false;
  const signaturesInWindow: SignatureInfo[] = [];

  while (!reachedStartBoundary) {
    const signatures = await getSignaturesForAddressWithRetry(
      connection,
      programId,
      before,
      stats
    );

    if (!signatures.length) break;

    for (const sig of signatures) {
      const bt = sig.blockTime;

      if (bt != null && bt < options.startTimestamp) {
        reachedStartBoundary = true;
        break;
      }

      if (bt == null || bt > options.endTimestamp) continue;

      if (sig.err != null) {
        stats.signaturesSkippedFailed += 1;

        if (DEBUG_OMNIPAIR && stats.signaturesSkippedFailed <= 5) {
          console.log("skipped failed signature:", sig.signature, "err:", sig.err);
        }

        continue;
      }

      signaturesInWindow.push({
        signature: sig.signature,
        blockTime: sig.blockTime ?? null,
        err: sig.err,
      });
    }

    before = signatures[signatures.length - 1].signature;
  }

  return signaturesInWindow;
}

function parseTransactionIntoSwapRows(
  tx: any,
  signature: string,
  blockTime: number | null,
  stats: OmnipairDebugStats
): OmnipairSwapRow[] {
  const logs = tx.meta?.logMessages ?? [];
  if (txFailedForOmnipair(logs)) {
    stats.txProgramFailures += 1;
    return [];
  }

  const accountKeys = tx.transaction.message.getAccountKeys({
    accountKeysFromLookups: tx.meta?.loadedAddresses,
  });

  const allKeys = [
    ...accountKeys.staticAccountKeys,
    ...(accountKeys.accountKeysFromLookups?.writable ?? []),
    ...(accountKeys.accountKeysFromLookups?.readonly ?? []),
  ].map((k: any) => k.toBase58());

  const swapIxs: Array<{
    args: SwapArgs;
    accounts: string[];
  }> = [];

  const swapEvents: SwapEvent[] = [];

  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions) {
      if (!("programIdIndex" in ix)) continue;

      const pid = allKeys[ix.programIdIndex];
      if (pid !== PROGRAM_ID) continue;

      const buf = decodeIxData(ix.data);

      if (startsWithDiscriminator(buf, SWAP_DISC)) {
        const args = decodeSwapArgs(buf);
        const accounts = ix.accounts.map((idx: number) => allKeys[idx]);
        swapIxs.push({ args, accounts });
        continue;
      }

      if (buf.length >= 16 && buf.subarray(8, 16).equals(SWAP_EVENT_DISC)) {
        const eventBuf = buf.subarray(8);
        swapEvents.push(decodeSwapEvent(eventBuf));
      }
    }
  }

  stats.totalSwapInstructions += swapIxs.length;
  stats.totalSwapEvents += swapEvents.length;

  if (!swapIxs.length || !swapEvents.length) {
    stats.txsWithNoSwapData += 1;
    return [];
  }

  const pairToEvents = new Map<string, SwapEvent[]>();
  for (const evt of swapEvents) {
    if (!pairToEvents.has(evt.pair)) pairToEvents.set(evt.pair, []);
    pairToEvents.get(evt.pair)!.push(evt);
  }

  const rows: OmnipairSwapRow[] = [];

  for (const swapIx of swapIxs) {
    const pairAddress = swapIx.accounts[0];
    const candidates = pairToEvents.get(pairAddress) ?? [];
    if (!candidates.length) continue;

    const evt = candidates.shift()!;
    pairToEvents.set(pairAddress, candidates);

    rows.push({
      txSignature: signature,
      blockTime,
      slot: evt.slot,
      pairAddress,
      userAddress: swapIx.accounts[9],
      tokenInMint: swapIx.accounts[7],
      tokenOutMint: swapIx.accounts[8],
      tokenInVault: swapIx.accounts[3],
      tokenOutVault: swapIx.accounts[4],
      userTokenInAccount: swapIx.accounts[5],
      userTokenOutAccount: swapIx.accounts[6],
      amountIn: evt.amountIn,
      minAmountOut: swapIx.args.minAmountOut,
      amountOut: evt.amountOut,
      amountInAfterFee: evt.amountInAfterFee,
      lpFee: evt.lpFee,
      protocolFee: evt.protocolFee,
      isToken0In: evt.isToken0In,
    });
  }

  stats.decodedRows += rows.length;
  return rows;
}

export async function fetchOmnipairSwaps(options: FetchOptions): Promise<OmnipairSwapRow[]> {
  const connection = new Connection(RPC_URL, "confirmed");
  const programId = new PublicKey(PROGRAM_ID);
  const stats = createDebugStats();

  const signatures = await collectInWindowSignatures(connection, programId, options, stats);
  stats.signaturesFetched = signatures.length;

  const rows: OmnipairSwapRow[] = [];

  for (const { signature, blockTime } of signatures) {
    const tx = await getTransactionWithRetry(connection, signature, stats);

    if (tx) {
      rows.push(...parseTransactionIntoSwapRows(tx, signature, blockTime, stats));
    }

    await sleep(PER_TX_DELAY_MS);
  }

  if (DEBUG_OMNIPAIR) {
    logDebugStats(stats);
  }

  return rows;
}