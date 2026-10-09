// DEEP (https://deepliquidity.fun): a Solana launchpad (the Deep Curve bonding-curve program)
// and DeepSwap, its constant-product AMM (a fork of Raydium cp-swap, Apache-2.0).
//
// Both programs report every trade in an Anchor event (a `Program data:` log line), with the
// fee of that trade already split by recipient. The adapters read those events from the
// transactions of the window, so volume and fees are the program's own numbers: no rate is
// assumed and nothing comes from an API.
//
// Event layouts and fee maths: https://github.com/Deep-Liquidity/deep-sdk (docs/INTEGRATORS.md,
// sections 5 and 7; the Anchor IDLs are in packages/sdk/idl).
import ADDRESSES from "./coreAssets.json";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "./metrics";
import { sleep } from "../utils/utils";
import { base58Decode, base58Encode, findProgramAddress, getAccountInfo, getSignaturesForAddress, getTransaction } from "./solana";

export const DEEP_CURVE_PROGRAM = "7czURwVLkQpcF1HVhhZU5GGzvPA8YniogZY1BhZHCDtA";
export const DEEP_AMM_PROGRAM = "HCrCy6bzHhZ1b6bXwQAucEFkKXyzYMh3hgAR8UPrYSEP";

// Every fee DEEP earns lands in one program-owned account, the Deep Curve PDA ["fee_vault"],
// or (the DeepSwap pool creation fee) in that vault's wrapped SOL token account.
const FEE_VAULT = findProgramAddress([Buffer.from("fee_vault")], DEEP_CURVE_PROGRAM)[0]; // 8a2XakVBzdMRJ6gMY6u8mvebzJGgbmG6nVBVPB8uwBVZ
const FEE_VAULT_WSOL = "EcnANJ5kYr7a8LpiH4ETkSGD3r7SDdicUn9ttf5MWCir"; // associated token account (wrapped SOL) of FEE_VAULT
// The Deep Curve PDA that pays for the DeepSwap pool of a token that graduates.
const GRADUATION_PAYER = findProgramAddress([Buffer.from("pool_creator")], DEEP_CURVE_PROGRAM)[0];

const SOL = ADDRESSES.solana.SOL;

// Anchor event discriminators: sha256("event:<Name>")[0..8]
const EVENT = {
  // Deep Curve
  Trade: "bddb7fd34ee661ee", // TradeEvent
  LaunchFeeCharged: "e2e3321153d20e95",
  Graduated: "33f142328cf59cc0",
  // DeepSwap
  Swap: "40c6cde8260871e2", // SwapEvent
  SwapFeesV1: "c7030bbc2479cfc0",
};

export const LABEL = {
  // Launchpad
  CurveProtocolFees: "Bonding Curve Trading Fees",
  CurveCreatorRewards: "Bonding Curve Creator Rewards",
  CurveHolderRewards: "Bonding Curve Holder Rewards",
  LaunchFees: "Token Launch Fees",
  MigrationFees: "Migration Fees",
  // DeepSwap
  SwapProtocolFees: METRIC.PROTOCOL_FEES,
  SwapLpFees: METRIC.LP_FEES,
  SwapCreatorRewards: "Creator Rewards",
  SwapHolderRewards: "Holder Rewards",
  PoolCreationFees: "Pool Creation Fees",
};

// The reward model a token's creator chose at launch (and a pool's creator at creation). It
// decides who receives the token's own reward fee; a Standard token or pool has none.
const REWARD_MODEL_HOLDER = 2;

// ---------------------------------------------------------------------------------------------
// Transactions of a program in a time window
// ---------------------------------------------------------------------------------------------

const PAGE = 1000;

// A rate-limited or briefly unavailable RPC is asked again, with a growing pause, before the
// run fails: a public endpoint answers 429 under load, and counting nothing would be wrong.
const RETRY_PAUSES_MS = [1_000, 2_000, 4_000, 8_000, 16_000];
// JSON-RPC codes a node answers with when it is behind or overloaded: -32005 (node unhealthy),
// -32603 (internal error), -32000 (server error).
const TRANSIENT_RPC_CODES: unknown[] = [-32005, -32603, -32000];
const isTransient = (error: unknown) =>
  TRANSIENT_RPC_CODES.includes((error as { code?: unknown } | null)?.code) ||
  /\b(429|502|503|504)\b|too many requests|rate limit|timeout|timed out|ECONNRESET|ETIMEDOUT|socket hang up/i.test(
    error instanceof Error ? error.message : String(error),
  );

async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= RETRY_PAUSES_MS.length || !isTransient(error)) throw error;
      await sleep(RETRY_PAUSES_MS[attempt]);
    }
  }
}

interface SignatureWalk {
  fetchedAt: number; // unix seconds: the walk holds every signature older than this
  entries: { signature: string; blockTime: number; failed: boolean }[]; // newest first
  complete: boolean; // reached the program's first transaction
}
// One walk per program and process: an hourly run asks for consecutive windows, and each of
// them would otherwise page back from the tip again.
const walks: Record<string, SignatureWalk> = {};
// The dexs and fees adapters of one program can ask at the same time. They share the walk, so
// its pages are fetched one caller at a time: two callers must never append the same page.
const walkQueue: Record<string, Promise<unknown>> = {};

// Signatures come newest first and cannot be asked for by time, so they are walked back from
// the tip until they are older than the window. Failed transactions changed nothing.
function signaturesInWindow(address: string, fromTimestamp: number, toTimestamp: number): Promise<string[]> {
  const previous = walkQueue[address] ?? Promise.resolve();
  // Runs after the previous caller whether it succeeded or failed; its own error stays its own.
  const mine = previous.then(
    () => walkSignatures(address, fromTimestamp, toTimestamp),
    () => walkSignatures(address, fromTimestamp, toTimestamp),
  );
  walkQueue[address] = mine.catch(() => undefined);
  return mine;
}

async function walkSignatures(address: string, fromTimestamp: number, toTimestamp: number): Promise<string[]> {
  let walk = walks[address];
  // A walk started before the window closed may miss the window's latest transactions.
  if (!walk || walk.fetchedAt < toTimestamp)
    walk = walks[address] = { fetchedAt: Math.floor(Date.now() / 1000), entries: [], complete: false };

  const oldest = () => walk.entries[walk.entries.length - 1];
  while (!walk.complete && (!walk.entries.length || oldest().blockTime >= fromTimestamp)) {
    const page = await withRetry(() => getSignaturesForAddress({ address, limit: PAGE, before: oldest()?.signature }));
    for (const entry of page) {
      // No block time yet: the transaction cannot be placed in or out of a window.
      if (typeof entry.blockTime !== "number") throw new Error(`deep: no block time for ${entry.signature}`);
      walk.entries.push({ signature: entry.signature, blockTime: entry.blockTime, failed: !!entry.err });
    }
    if (page.length < PAGE) walk.complete = true;
  }

  return walk.entries
    .filter((entry) => entry.blockTime >= fromTimestamp && entry.blockTime < toTimestamp && !entry.failed)
    .map((entry) => entry.signature);
}

interface ProgramEvent {
  frame: number; // the program invocation that emitted it, numbered in log order
  data: Buffer;
}

interface ProgramLogs {
  events: ProgramEvent[];
  /**
   * Whether every log line of that invocation was returned. False only in a transaction whose
   * logs the network cut off, for the invocations that had not finished by then.
   */
  complete: (frame: number) => boolean;
}

// A transaction's logs carry the events of every program it touched, and a program can log
// arbitrary bytes, so an event is only trusted when the DEEP program is the one running: the
// innermost invocation still open when the line was written.
//
// The network keeps about 10 kB of logs per transaction and then writes "Log truncated": a
// transaction with many instructions loses the events of its last ones. Nothing after that
// line is read (lines that still fit can follow it, with gaps), and the caller is told which
// invocations were logged in full.
function programEvents(logs: string[], programId: string): ProgramLogs {
  const events: ProgramEvent[] = [];
  const stack: { program: string; frame: number }[] = [];
  const finished = new Set<number>();
  let truncated = false;
  let frame = 0;
  for (const log of logs) {
    if (log === "Log truncated") { truncated = true; break; }
    const invoked = log.match(/^Program (\S+) invoke \[\d+\]$/);
    if (invoked) { stack.push({ program: invoked[1], frame: frame++ }); continue; }
    if (/^Program \S+ (success|failed)/.test(log)) {
      const done = stack.pop();
      if (done) finished.add(done.frame);
      continue;
    }
    const emitted = log.match(/^Program data: (\S+)$/);
    const top = stack[stack.length - 1];
    if (emitted && top?.program === programId)
      events.push({ frame: top.frame, data: Buffer.from(emitted[1], "base64") });
  }
  return { events, complete: (index) => !truncated || finished.has(index) };
}

const isEvent = (event: ProgramEvent, discriminator: string) =>
  event.data.subarray(0, 8).toString("hex") === discriminator;

function eventField(event: ProgramEvent, offset: number, name: string): bigint {
  if (event.data.length < offset + 8) throw new Error(`deep: event too short to hold ${name}`);
  return event.data.readBigUInt64LE(offset);
}

// The parts of a `getTransaction` answer (encoding "jsonParsed") that are read here.
interface RpcInstruction {
  programId: string;
  /** Present when the node could parse the instruction (the System Program's always are). */
  parsed?: unknown;
  /** Present when the node could not parse it (a DEEP program's instructions): its accounts. */
  accounts?: string[];
  /** Present when the node could not parse it: the instruction data, base58. */
  data?: string;
  /** Inner instructions only: 2 for what a top-level instruction invokes, and so on. */
  stackHeight?: number | null;
}
interface RpcTransaction {
  meta: {
    logMessages?: string[] | null;
    innerInstructions?: { index: number; instructions: RpcInstruction[] }[] | null;
  } | null;
  transaction: { message: { instructions: RpcInstruction[] } };
}
/** A transaction whose logs were returned: the only kind that is processed. */
type LoggedTransaction = RpcTransaction & { meta: { logMessages: string[] } };

interface SystemTransfer {
  source: string;
  destination: string;
  lamports: bigint;
}

interface ParsedInstruction {
  frame: number; // its place in execution order: the number of its invocation in the logs
  parentFrame?: number; // the instruction that invoked it; undefined at the top level
  parent?: string; // the program that invoked this instruction; undefined at the top level
  programId: string;
  parsed?: unknown;
  accounts?: string[];
  data?: string;
}

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

// A System Program `transfer` as the node parsed it, or undefined for anything else.
function asSystemTransfer(ix: ParsedInstruction): SystemTransfer | undefined {
  if (ix.programId !== SYSTEM_PROGRAM || typeof ix.parsed !== "object" || ix.parsed === null) return undefined;
  const { type, info } = ix.parsed as { type?: unknown; info?: unknown };
  if (type !== "transfer" || typeof info !== "object" || info === null) return undefined;
  const { source, destination, lamports } = info as Record<string, unknown>;
  if (typeof source !== "string" || typeof destination !== "string") return undefined;
  if (typeof lamports !== "number" && typeof lamports !== "string") return undefined;
  return { source, destination, lamports: BigInt(lamports) };
}

// Every instruction of the transaction, top-level and inner, with the program that invoked it.
function instructionsWithParent(tx: LoggedTransaction, signature: string): ParsedInstruction[] {
  const all: ParsedInstruction[] = [];
  const innerByIndex: Record<number, RpcInstruction[]> = {};
  for (const group of tx.meta.innerInstructions ?? []) innerByIndex[group.index] = group.instructions;
  tx.transaction.message.instructions.forEach((outer, index) => {
    const stack: ParsedInstruction[] = [];
    const push = (ix: RpcInstruction) => {
      const parent = stack[stack.length - 1];
      const entry: ParsedInstruction = {
        frame: all.length,
        parentFrame: parent?.frame,
        parent: parent?.programId,
        programId: ix.programId,
        parsed: ix.parsed,
        accounts: ix.accounts,
        data: ix.data,
      };
      all.push(entry);
      stack.push(entry);
    };
    push(outer);
    for (const inner of innerByIndex[index] ?? []) {
      // stackHeight: 1 for a top-level instruction, 2 for what it invokes, and so on.
      if (typeof inner.stackHeight !== "number" || inner.stackHeight < 2 || inner.stackHeight > stack.length + 1)
        throw new Error(`deep: cannot rebuild the call stack of ${signature}`);
      stack.length = inner.stackHeight - 1;
      push(inner);
    }
  });
  return all;
}

// Lamports moved by System Program transfers that match `filter`.
function systemTransfers(instructions: ParsedInstruction[], filter: (transfer: SystemTransfer, parent?: string) => boolean): bigint {
  let lamports = 0n;
  for (const ix of instructions) {
    const transfer = asSystemTransfer(ix);
    if (transfer && filter(transfer, ix.parent)) lamports += transfer.lamports;
  }
  return lamports;
}

const hasLogs = (tx: RpcTransaction | null | undefined): tx is LoggedTransaction => Array.isArray(tx?.meta?.logMessages);

// The program's own instructions whose events the network cut from the logs (none in nearly
// every transaction), in execution order. `counted` says whether an instruction's event was
// read before the cut.
function unloggedInstructions(all: ParsedInstruction[], logs: ProgramLogs, programId: string, signature: string, counted: (frame: number) => boolean): ParsedInstruction[] {
  // Instructions and log invocations are numbered alike, so every event read must belong to
  // an instruction of the program.
  for (const event of logs.events)
    if (all[event.frame]?.programId !== programId) throw new Error(`deep: logs and instructions of ${signature} do not line up`);
  return all.filter((ix) => ix.programId === programId && !logs.complete(ix.frame) && !counted(ix.frame));
}

async function forEachTransaction(programId: string, options: FetchOptions, handle: (tx: LoggedTransaction, logs: ProgramLogs, signature: string) => void | Promise<void>) {
  const signatures = await signaturesInWindow(programId, options.startTimestamp, options.endTimestamp);
  // One request at a time: public Solana RPCs rate-limit getTransaction.
  for (const signature of signatures) {
    // The signature was just listed, so the transaction exists: an empty answer means this
    // node cannot serve it (public RPC pools answer from nodes with different histories),
    // not that nothing was traded. Ask again, then fail rather than count it as zero.
    let tx: RpcTransaction | null | undefined;
    for (let attempt = 0; attempt < 4 && !hasLogs(tx); attempt++) {
      if (attempt > 0) await sleep(1000 * 2 ** attempt); // 2 s, 4 s, 8 s
      tx = await withRetry(() => getTransaction({ signature, encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }));
    }
    if (!hasLogs(tx)) throw new Error(`deep: no transaction logs for ${signature}`);
    await handle(tx, programEvents(tx.meta.logMessages, programId), signature);
  }
}

// ---------------------------------------------------------------------------------------------
// Launchpad (Deep Curve)
// ---------------------------------------------------------------------------------------------

// TradeEvent: 8 discriminator | mint 32 | trader 32 | is_buy u8 @72 | sol_amount u64 @73 |
// token_amount u64 @81 | protocol_fee u64 @89 | creator_fee u64 @97 | 4 x reserves u64 |
// timestamp i64 @137 | reward_model u8 @145 | holder_fee u64 @146
// LaunchFeeCharged: ... | usd_cents u16 @72 | lamports u64 @74 | ...

// Anchor instruction discriminator: sha256("global:buy")[0..8]
const BUY_INSTRUCTION = "66063d1201daebea";
// Anchor account discriminator: sha256("account:BondingCurve")[0..8]
const BONDING_CURVE_ACCOUNT = "17b7f83760d8ac60";
const BPS = 10_000n;

interface CurveTerms {
  buyProtocolFeeBps: bigint;
  rewardBps: bigint;
  toHolders: boolean;
}
// A token's fee terms are written to its bonding-curve account at launch and never change.
const curveTerms: Record<string, Promise<CurveTerms>> = {};

// BondingCurve: 8 discriminator | mint 32 | creator 32 | 6 x u64 | protocol_fee_bps u16 @120
// (the buy side) | creator_fee_bps u16 @122 (the token's reward rate) | ... | reward_model u8 @187
function readCurveTerms(curve: string): Promise<CurveTerms> {
  return (curveTerms[curve] ??= (async () => {
    const account = await withRetry(() => getAccountInfo({ account: curve, encoding: "base64" }));
    const data = Array.isArray(account?.data) ? Buffer.from(account.data[0], "base64") : undefined;
    if (account?.owner !== DEEP_CURVE_PROGRAM || !data || data.length < 188 || data.subarray(0, 8).toString("hex") !== BONDING_CURVE_ACCOUNT)
      throw new Error(`deep: ${curve} is not a bonding curve`);
    return {
      buyProtocolFeeBps: BigInt(data.readUInt16LE(120)),
      rewardBps: BigInt(data.readUInt16LE(122)),
      toHolders: data[187] === REWARD_MODEL_HOLDER,
    };
  })());
}

interface CurveTrade {
  gross: bigint; // SOL traded, fees included
  protocolFee: bigint;
  creatorFee: bigint;
  holderFee: bigint;
}

// A buy whose event the network cut from the logs, rebuilt from what the transaction still
// holds. A buy makes one System Program transfer, buyer to bonding curve, of exactly the
// event's sol_amount (the SOL paid, fees included), and the program computes the fee from
// that amount and the token's own rates alone: total = ceil(amount x (protocol + reward) /
// 10 000), reward = floor(amount x reward / 10 000), protocol = total - reward. So the result
// equals the missing event to the lamport. Accounts of a buy: buyer, config, mint, curve, ...
async function rebuildBuy(buy: ParsedInstruction, all: ParsedInstruction[], signature: string): Promise<CurveTrade> {
  const [buyer, , , curve] = buy.accounts ?? [];
  const payments = all
    .filter((ix) => ix.parentFrame === buy.frame)
    .map(asSystemTransfer)
    .filter((transfer): transfer is SystemTransfer => !!transfer);
  if (!buyer || !curve || payments.length !== 1 || payments[0].source !== buyer || payments[0].destination !== curve)
    throw new Error(`deep: cannot rebuild the buy cut from the logs of ${signature}`);
  const gross = payments[0].lamports;
  const terms = await readCurveTerms(curve);
  const total = (gross * (terms.buyProtocolFeeBps + terms.rewardBps) + BPS - 1n) / BPS;
  const reward = (gross * terms.rewardBps) / BPS;
  return {
    gross,
    protocolFee: total - reward,
    creatorFee: terms.toHolders ? 0n : reward,
    holderFee: terms.toHolders ? reward : 0n,
  };
}
/**
 * Volume, fees and revenue of the DEEP launchpad (Deep Curve) in the window
 * `options.startTimestamp` (inclusive) to `options.endTimestamp` (exclusive), read from the
 * program's own events in that window's successful transactions.
 *
 * @returns `dailyVolume`: SOL traded on the bonding curves, gross of fees on both sides.
 *   `dailyFees`: everything users paid (trading fees, creator and holder rewards, launch fees,
 *   migration fees). `dailyRevenue` and `dailyProtocolRevenue`: the part DEEP receives.
 *   `dailySupplySideRevenue`: the creator and holder rewards. All in SOL (lamports).
 */
export async function fetchDeepLaunchpad(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const addTrade = ({ gross, protocolFee, creatorFee, holderFee }: CurveTrade) => {
    dailyVolume.add(SOL, gross);

    dailyFees.add(SOL, protocolFee, LABEL.CurveProtocolFees);
    dailyRevenue.add(SOL, protocolFee, LABEL.CurveProtocolFees);
    dailyFees.add(SOL, creatorFee, LABEL.CurveCreatorRewards);
    dailySupplySideRevenue.add(SOL, creatorFee, LABEL.CurveCreatorRewards);
    dailyFees.add(SOL, holderFee, LABEL.CurveHolderRewards);
    dailySupplySideRevenue.add(SOL, holderFee, LABEL.CurveHolderRewards);
  };

  await forEachTransaction(DEEP_CURVE_PROGRAM, options, async (tx, logs, signature) => {
    const { events } = logs;
    for (const event of events) {
      if (isEvent(event, EVENT.Trade)) {
        const isBuy = event.data[72] === 1;
        const solAmount = eventField(event, 73, "sol_amount");
        const protocolFee = eventField(event, 89, "protocol_fee");
        const creatorFee = eventField(event, 97, "creator_fee");
        const holderFee = eventField(event, 146, "holder_fee");
        // sol_amount is what the buyer paid, fees included, or what the seller received, fees
        // already taken: the fees are added back so both sides are gross.
        addTrade({ gross: isBuy ? solAmount : solAmount + protocolFee + creatorFee + holderFee, protocolFee, creatorFee, holderFee });
      } else if (isEvent(event, EVENT.LaunchFeeCharged)) {
        const lamports = eventField(event, 74, "lamports");
        dailyFees.add(SOL, lamports, LABEL.LaunchFees);
        dailyRevenue.add(SOL, lamports, LABEL.LaunchFees);
      }
    }

    // Instructions whose events the network cut from the logs. A buy is rebuilt exactly; for
    // anything else the run fails rather than report a day that is short.
    const instructions = instructionsWithParent(tx, signature);
    const tradeFrames = new Set(events.filter((event) => isEvent(event, EVENT.Trade)).map((event) => event.frame));
    for (const ix of unloggedInstructions(instructions, logs, DEEP_CURVE_PROGRAM, signature, (frame) => tradeFrames.has(frame))) {
      const discriminator = ix.data ? Buffer.from(base58Decode(ix.data)).subarray(0, 8).toString("hex") : "";
      if (discriminator !== BUY_INSTRUCTION)
        throw new Error(`deep: the logs of ${signature} are truncated and an instruction other than a buy lost its events`);
      addTrade(await rebuildBuy(ix, instructions, signature));
    }

    // The migration fee (a share of the SOL the curve raised) first pays the network rent of
    // the new pool's accounts; what DEEP receives is what the graduation then sends to the fee
    // vault, including the pool creation fee DeepSwap charges it. The transfers are those of
    // the whole transaction, so they are summed once however many tokens graduate in it.
    if (events.some((event) => isEvent(event, EVENT.Graduated))) {
      const toVault = systemTransfers(
        instructions,
        ({ source, destination }) => source === GRADUATION_PAYER && (destination === FEE_VAULT || destination === FEE_VAULT_WSOL),
      );
      dailyFees.add(SOL, toVault, LABEL.MigrationFees);
      dailyRevenue.add(SOL, toVault, LABEL.MigrationFees);
    }
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
}

// ---------------------------------------------------------------------------------------------
// DeepSwap
// ---------------------------------------------------------------------------------------------

// SwapEvent: 8 discriminator | pool_id 32 | input_vault_before u64 | output_vault_before u64 |
// input_amount u64 @56 | output_amount u64 @64 | ...
// SwapFeesV1: 8 discriminator | pool_id 32 | is_buy u8 @40 | quote_mint 32 @41 | lp_fee u64 @73 |
// protocol_fee u64 @81 | reward_fee u64 @89 | reward_model u8 @97
/**
 * Volume, fees and revenue of DeepSwap in the window `options.startTimestamp` (inclusive) to
 * `options.endTimestamp` (exclusive), read from the program's own events in that window's
 * successful transactions.
 *
 * @returns `dailyVolume`: the quote side of every swap, gross of fees. `dailyFees`: everything
 *   traders and pool creators paid (LP fees, DEEP's fee, creator and holder rewards, pool
 *   creation fees). `dailyRevenue` and `dailyProtocolRevenue`: the part DEEP receives.
 *   `dailySupplySideRevenue`: LP fees and the creator and holder rewards. Each amount is in
 *   the pool's quote token (base units); pool creation fees are in SOL (lamports).
 */
export async function fetchDeepSwap(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  await forEachTransaction(DEEP_AMM_PROGRAM, options, (tx, logs, signature) => {
    const { events } = logs;
    const instructions = instructionsWithParent(tx, signature);
    // The events of every DeepSwap instruction must have been returned: a swap cut from the
    // logs cannot be counted, and the run fails rather than report a day that is short.
    if (unloggedInstructions(instructions, logs, DEEP_AMM_PROGRAM, signature, () => false).length)
      throw new Error(`deepswap: the logs of ${signature} are truncated, its events cannot be read`);
    // A swap emits one SwapEvent and one SwapFeesV1 from the same invocation.
    for (const swap of events.filter((event) => isEvent(event, EVENT.Swap))) {
      const fees = events.find((event) => event.frame === swap.frame && isEvent(event, EVENT.SwapFeesV1));
      // Every mainnet pool uses the V1 fee model. A swap without the fee event would be on a
      // pool of the pre-launch model, which exists on devnet only.
      if (!fees) throw new Error(`deepswap: swap without a SwapFeesV1 event in ${signature}`);
      if (!swap.data.subarray(8, 40).equals(fees.data.subarray(8, 40)))
        throw new Error(`deepswap: swap and fee events of different pools in ${signature}`);

      // A pool's fees are all charged in its quote token (SOL on a TOKEN/SOL pool): on the
      // input of a buy, on the output of a sell.
      const isBuy = fees.data[40] === 1;
      const quoteMint = base58Encode(fees.data.subarray(41, 73));
      const lpFee = eventField(fees, 73, "lp_fee");
      const protocolFee = eventField(fees, 81, "protocol_fee");
      const rewardFee = eventField(fees, 89, "reward_fee");
      const toHolders = fees.data[97] === REWARD_MODEL_HOLDER;

      // Volume is the quote side, before fees. A buy's input amount is what the trader sent;
      // a sell's output amount is what the trader received, after the fees were taken from it.
      const volume = isBuy
        ? eventField(swap, 56, "input_amount")
        : eventField(swap, 64, "output_amount") + lpFee + protocolFee + rewardFee;
      dailyVolume.add(quoteMint, volume);

      dailyFees.add(quoteMint, protocolFee, LABEL.SwapProtocolFees);
      dailyRevenue.add(quoteMint, protocolFee, LABEL.SwapProtocolFees);
      dailyFees.add(quoteMint, lpFee, LABEL.SwapLpFees);
      dailySupplySideRevenue.add(quoteMint, lpFee, LABEL.SwapLpFees);
      const rewardLabel = toHolders ? LABEL.SwapHolderRewards : LABEL.SwapCreatorRewards;
      dailyFees.add(quoteMint, rewardFee, rewardLabel);
      dailySupplySideRevenue.add(quoteMint, rewardFee, rewardLabel);
    }

    // Opening a pool costs a flat fee in SOL, which DeepSwap itself transfers to the fee
    // vault's wrapped SOL account. The pool of a graduating token is paid for out of that
    // token's migration fee, which the launchpad adapter reports, so it is left out here.
    const poolCreationFees = systemTransfers(
      instructions,
      ({ source, destination }, parent) => parent === DEEP_AMM_PROGRAM && destination === FEE_VAULT_WSOL && source !== GRADUATION_PAYER,
    );
    dailyFees.add(SOL, poolCreationFees, LABEL.PoolCreationFees);
    dailyRevenue.add(SOL, poolCreationFees, LABEL.PoolCreationFees);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
}
