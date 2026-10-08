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
import PromisePool from "@supercharge/promise-pool";
import ADDRESSES from "./coreAssets.json";
import { FetchOptions } from "../adapters/types";
import { METRIC } from "./metrics";
import { sleep } from "../utils/utils";
import { base58Encode, findProgramAddress, getSignaturesForAddress, getTransaction } from "./solana";

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

interface SignatureWalk {
  fetchedAt: number; // unix seconds: the walk holds every signature older than this
  entries: { signature: string; blockTime: number; failed: boolean }[]; // newest first
  complete: boolean; // reached the program's first transaction
}
// One walk per program and process: an hourly run asks for consecutive windows, and each of
// them would otherwise page back from the tip again.
const walks: Record<string, SignatureWalk> = {};

// Signatures come newest first and cannot be asked for by time, so they are walked back from
// the tip until they are older than the window. Failed transactions changed nothing.
async function signaturesInWindow(address: string, fromTimestamp: number, toTimestamp: number): Promise<string[]> {
  let walk = walks[address];
  // A walk started before the window closed may miss the window's latest transactions.
  if (!walk || walk.fetchedAt < toTimestamp)
    walk = walks[address] = { fetchedAt: Math.floor(Date.now() / 1000), entries: [], complete: false };

  const oldest = () => walk.entries[walk.entries.length - 1];
  while (!walk.complete && (!walk.entries.length || oldest().blockTime >= fromTimestamp)) {
    const page = await getSignaturesForAddress({ address, limit: PAGE, before: oldest()?.signature });
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

// A transaction's logs carry the events of every program it touched, and a program can log
// arbitrary bytes, so an event is only trusted when the DEEP program is the one running: the
// innermost invocation still open when the line was written.
function programEvents(logs: string[], programId: string, signature: string): ProgramEvent[] {
  const events: ProgramEvent[] = [];
  const stack: { program: string; frame: number }[] = [];
  let frame = 0;
  for (const log of logs) {
    if (log === "Log truncated")
      throw new Error(`deep: the logs of ${signature} are truncated, its events cannot be read`);
    const invoked = log.match(/^Program (\S+) invoke \[\d+\]$/);
    if (invoked) { stack.push({ program: invoked[1], frame: frame++ }); continue; }
    if (/^Program \S+ (success|failed)/.test(log)) { stack.pop(); continue; }
    const emitted = log.match(/^Program data: (\S+)$/);
    const top = stack[stack.length - 1];
    if (emitted && top?.program === programId)
      events.push({ frame: top.frame, data: Buffer.from(emitted[1], "base64") });
  }
  return events;
}

const isEvent = (event: ProgramEvent, discriminator: string) =>
  event.data.subarray(0, 8).toString("hex") === discriminator;

function eventField(event: ProgramEvent, offset: number, name: string): bigint {
  if (event.data.length < offset + 8) throw new Error(`deep: event too short to hold ${name}`);
  return event.data.readBigUInt64LE(offset);
}

interface ParsedInstruction {
  parent?: string; // the program that invoked this instruction; undefined at the top level
  programId: string;
  parsed?: any;
}

// Every instruction of the transaction, top-level and inner, with the program that invoked it.
function instructionsWithParent(tx: any, signature: string): ParsedInstruction[] {
  const all: ParsedInstruction[] = [];
  const innerByIndex: Record<number, any[]> = {};
  for (const group of tx.meta.innerInstructions ?? []) innerByIndex[group.index] = group.instructions;
  tx.transaction.message.instructions.forEach((outer: any, index: number) => {
    const stack: string[] = [outer.programId];
    all.push({ programId: outer.programId, parsed: outer.parsed });
    for (const inner of innerByIndex[index] ?? []) {
      // stackHeight: 1 for a top-level instruction, 2 for what it invokes, and so on.
      if (typeof inner.stackHeight !== "number" || inner.stackHeight < 2 || inner.stackHeight > stack.length + 1)
        throw new Error(`deep: cannot rebuild the call stack of ${signature}`);
      stack.length = inner.stackHeight - 1;
      all.push({ parent: stack[stack.length - 1], programId: inner.programId, parsed: inner.parsed });
      stack.push(inner.programId);
    }
  });
  return all;
}

// Lamports moved by System Program transfers that match `filter`.
function systemTransfers(instructions: ParsedInstruction[], filter: (transfer: { source: string; destination: string }, parent?: string) => boolean): bigint {
  let lamports = 0n;
  for (const ix of instructions) {
    if (ix.programId !== "11111111111111111111111111111111" || ix.parsed?.type !== "transfer") continue;
    if (filter(ix.parsed.info, ix.parent)) lamports += BigInt(ix.parsed.info.lamports);
  }
  return lamports;
}

async function forEachTransaction(programId: string, options: FetchOptions, handle: (tx: any, events: ProgramEvent[], signature: string) => void) {
  const signatures = await signaturesInWindow(programId, options.startTimestamp, options.endTimestamp);
  // One request at a time: public Solana RPCs rate-limit getTransaction.
  await PromisePool.withConcurrency(1)
    .for(signatures)
    .handleError((error) => { throw error; })
    .process(async (signature) => {
      // The signature was just listed, so the transaction exists: an empty answer means this
      // node cannot serve it (public RPC pools answer from nodes with different histories),
      // not that nothing was traded. Ask again, then fail rather than count it as zero.
      let tx: any;
      for (let attempt = 0; attempt < 6 && !tx?.meta?.logMessages; attempt++) {
        if (attempt > 0) await sleep(1000 * 2 ** attempt); // 2 s, 4 s, ... 32 s
        tx = await getTransaction({ signature, encoding: "jsonParsed", maxSupportedTransactionVersion: 0 });
      }
      if (!tx?.meta?.logMessages) throw new Error(`deep: no transaction logs for ${signature}`);
      handle(tx, programEvents(tx.meta.logMessages, programId, signature), signature);
    });
}

// ---------------------------------------------------------------------------------------------
// Launchpad (Deep Curve)
// ---------------------------------------------------------------------------------------------

// TradeEvent: 8 discriminator | mint 32 | trader 32 | is_buy u8 @72 | sol_amount u64 @73 |
// token_amount u64 @81 | protocol_fee u64 @89 | creator_fee u64 @97 | 4 x reserves u64 |
// timestamp i64 @137 | reward_model u8 @145 | holder_fee u64 @146
// LaunchFeeCharged: ... | usd_cents u16 @72 | lamports u64 @74 | ...
export async function fetchDeepLaunchpad(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  await forEachTransaction(DEEP_CURVE_PROGRAM, options, (tx, events, signature) => {
    for (const event of events) {
      if (isEvent(event, EVENT.Trade)) {
        const isBuy = event.data[72] === 1;
        const solAmount = eventField(event, 73, "sol_amount");
        const protocolFee = eventField(event, 89, "protocol_fee");
        const creatorFee = eventField(event, 97, "creator_fee");
        const holderFee = eventField(event, 146, "holder_fee");
        // sol_amount is what the buyer paid, fees included, or what the seller received, fees
        // already taken: the fees are added back so both sides are gross.
        const gross = isBuy ? solAmount : solAmount + protocolFee + creatorFee + holderFee;
        dailyVolume.add(SOL, gross);

        dailyFees.add(SOL, protocolFee, LABEL.CurveProtocolFees);
        dailyRevenue.add(SOL, protocolFee, LABEL.CurveProtocolFees);
        dailyFees.add(SOL, creatorFee, LABEL.CurveCreatorRewards);
        dailySupplySideRevenue.add(SOL, creatorFee, LABEL.CurveCreatorRewards);
        dailyFees.add(SOL, holderFee, LABEL.CurveHolderRewards);
        dailySupplySideRevenue.add(SOL, holderFee, LABEL.CurveHolderRewards);
      } else if (isEvent(event, EVENT.LaunchFeeCharged)) {
        const lamports = eventField(event, 74, "lamports");
        dailyFees.add(SOL, lamports, LABEL.LaunchFees);
        dailyRevenue.add(SOL, lamports, LABEL.LaunchFees);
      } else if (isEvent(event, EVENT.Graduated)) {
        // The migration fee (a share of the SOL the curve raised) first pays the network rent
        // of the new pool's accounts; what DEEP receives is what the graduation then sends to
        // the fee vault, including the pool creation fee DeepSwap charges it.
        const toVault = systemTransfers(
          instructionsWithParent(tx, signature),
          ({ source, destination }) => source === GRADUATION_PAYER && (destination === FEE_VAULT || destination === FEE_VAULT_WSOL),
        );
        dailyFees.add(SOL, toVault, LABEL.MigrationFees);
        dailyRevenue.add(SOL, toVault, LABEL.MigrationFees);
      }
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
export async function fetchDeepSwap(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  await forEachTransaction(DEEP_AMM_PROGRAM, options, (tx, events, signature) => {
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
      instructionsWithParent(tx, signature),
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
