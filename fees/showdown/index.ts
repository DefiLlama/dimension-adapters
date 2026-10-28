import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransaction, solanaRpc } from "../../helpers/solana";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MONEY_MATCHES = "HaYXyyYKZDdom2khSh6xwkV7rFtEXfiS7GMZTEdPuWKo";
const TOURNAMENTS = "CZqTYLYYzLNGbivgkz4CDMEqHq9uajhrt5Ho5QTnF9Ei";
const FIRST_SLOT = 456236284;
const START_TIMESTAMP = Date.parse("2026-10-13T00:00:00Z") / 1000;
const MATCH_RESOLVED = "c33773f466d7dd28";
const TOURNAMENT_CLOSED = "f6899b59e2265708";
type Totals = { volume: bigint; fees: bigint };

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
let rpcQueue: Promise<void> = Promise.resolve();

function rpc<T>(call: () => Promise<T>): Promise<T> {
  const result = rpcQueue.then(async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await sleep(500);
      try {
        return await call();
      } catch (error) {
        if (!/429|Too Many Requests/i.test(String(error)) || attempt === 4) throw error;
        await sleep(2000 * 2 ** attempt);
      }
    }
    throw new Error("showdown: RPC retries exhausted");
  });
  rpcQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function signaturesInWindow(program: string, from: number, to: number): Promise<string[]> {
  const signatures: string[] = [];
  let before: string | undefined;
  const blockTimes = new Map<number, number | null>();
  for (;;) {
    const page: any[] = await rpc(() => solanaRpc("getSignaturesForAddress", [
      program, { before, limit: 1000, commitment: "finalized" },
    ]));
    if (!Array.isArray(page)) throw new Error(`showdown: invalid signature response for ${program}`);
    for (const s of page) {
      if (s.err) continue;
      if (typeof s.slot !== "number") throw new Error(`showdown: signature ${s.signature} has no slot`);
      if (s.slot < FIRST_SLOT) continue;
      let blockTime = s.blockTime;
      if (blockTime == null) {
        if (!blockTimes.has(s.slot))
          blockTimes.set(s.slot, await rpc(() => solanaRpc("getBlockTime", [s.slot])));
        blockTime = blockTimes.get(s.slot);
      }
      if (typeof blockTime !== "number") {
        console.warn(`showdown: no block time for ${s.signature} (slot ${s.slot})`);
        continue;
      }
      if (blockTime >= from && blockTime < to) signatures.push(s.signature);
    }
    if (page.length < 1000) break;
    const oldest = page[page.length - 1];
    const oldestTime = oldest.blockTime ?? blockTimes.get(oldest.slot);
    if (oldest.slot < FIRST_SLOT || (typeof oldestTime === "number" && oldestTime < from)) break;
    before = oldest.signature;
  }
  return signatures;
}

function programEvents(logs: string[], program: string): Buffer[] {
  const events: Buffer[] = [];
  const frames: string[] = [];
  for (const log of logs) {
    const invoked = log.match(/^Program (\S+) invoke \[\d+\]$/);
    if (invoked) { frames.push(invoked[1]); continue; }
    if (/^Program \S+ (success|failed)/.test(log)) { frames.pop(); continue; }
    const emitted = log.match(/^Program data: (\S+)$/);
    if (emitted && frames[frames.length - 1] === program)
      events.push(Buffer.from(emitted[1], "base64"));
  }
  return events;
}

async function totalsFromTransaction(signature: string, program: string): Promise<Totals> {
  const tx = await rpc(() => getTransaction({ signature, maxSupportedTransactionVersion: 0 }));
  if (!tx?.meta?.logMessages) throw new Error(`showdown: missing transaction logs for ${signature}`);
  if (tx.meta.err) return { volume: 0n, fees: 0n };
  let volume = 0n;
  let fees = 0n;
  for (const event of programEvents(tx.meta.logMessages, program)) {
    const discriminator = event.subarray(0, 8).toString("hex");
    if (program === MONEY_MATCHES && discriminator === MATCH_RESOLVED) {
      if (event.length !== 121) throw new Error(`showdown: invalid MatchResolved event in ${signature}`);
      volume += 2n * event.readBigUInt64LE(88); // amount_per_player
      fees += 2n * event.readBigUInt64LE(97);   // rake_per_player
    } else if (program === TOURNAMENTS && discriminator === TOURNAMENT_CLOSED) {
      if (event.length !== 109) throw new Error(`showdown: invalid TournamentClosed event in ${signature}`);
      volume += event.readBigUInt64LE(36); // total_buy_ins
      volume += event.readBigUInt64LE(61); // sponsored
      volume += event.readBigUInt64LE(69); // overlay
      fees += event.readBigUInt64LE(45);   // total_rake
    }
  }
  return { volume, fees };
}

async function totalsForProgram(program: string, from: number, to: number): Promise<Totals> {
  if (from >= to) return { volume: 0n, fees: 0n };
  const signatures = await signaturesInWindow(program, from, to);
  const { results, errors } = await PromisePool.withConcurrency(1).for(signatures)
    .process(signature => totalsFromTransaction(signature, program));
  if (errors.length) throw errors[0];
  return results.reduce((total, result) => ({
    volume: total.volume + result.volume,
    fees: total.fees + result.fees,
  }), { volume: 0n, fees: 0n });
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const from = Math.max(options.startTimestamp + 1, START_TIMESTAMP);
  const to = options.endTimestamp;
  const matches = await totalsForProgram(MONEY_MATCHES, from, to);
  const tournaments = await totalsForProgram(TOURNAMENTS, from, to);
  dailyVolume.add(USDC, matches.volume, "Money Matches");
  dailyVolume.add(USDC, tournaments.volume, "Tournaments");
  dailyFees.add(USDC, matches.fees, "Money Matches");
  dailyFees.add(USDC, tournaments.fees, "Tournaments");
  return { dailyVolume, dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  start: "2026-10-13",
  fetch,
  skipBreakdownValidation: true,
  methodology: {
    Volume: "Money matches, tournament buy-ins, sponsorships, and guarantee overlays.",
    Fees: "Rake collected from money matches and tournaments. Revenue is not reported because rakeback and referral distributions cannot be determined from these events.",
  },
  breakdownMethodology: {
    Volume: {
      "Money Matches": "Money matches.",
      "Tournaments": "Tournament buy-ins, sponsorships, and guarantee overlays.",
    },
    Fees: {
      "Money Matches": "Rake from money matches.",
      "Tournaments": "Rake from tournaments.",
    },
  },
};

export default adapter;
