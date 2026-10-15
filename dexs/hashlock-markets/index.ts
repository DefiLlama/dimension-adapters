/**
 * Hashlock Markets — non-custodial cross-chain OTC: two parties agree a price over a sealed RFQ, then
 * each locks its side ("leg") in a hash time-locked escrow. Both legs commit to the same
 * sha256(secret) hashlock; claiming one leg reveals the secret, which claims the other.
 * Website: https://hashlock.markets · Docs: https://docs.hashlock.markets
 *
 * Escrows (mainnet):
 *   EVM (every chain in EVM_CHAINS) — HTLCFactory 0xa9B6a64837259034E949787B5d17Bfa46304ff71 deploys one
 *     minimal-proxy clone per leg (SwapCreated); the clone emits Claimed(secret) / Refunded.
 *   TRON — SharedHTLC pool TE97fe1beR5nRZzjixi4azE36qWcHEWmNj (Funded / Claimed / Refunded / FeeCollected).
 *   Solana — program 7Egsecq7YU5n7PonndM7W7W92EFLZVGrnoaNPW8n1DEc, one escrow PDA per leg (Anchor events
 *     Funded / Claimed).
 *   Bitcoin — a P2WSH script per leg; not read here (see below).
 *
 * Volume counts each trade ONCE, at the FIRST claim of its hashlock. The secret holder claims the leg that
 * pays them first — the short-timelock leg, never the Bitcoin one — and that claim reveals the secret;
 * every later claim with the same secret (the other leg, or any escrow someone else funded with the same
 * hashlock) comes after it and is not counted. The hashlock of a claim is sha256 of the secret it reveals,
 * so claims are matched across every indexed chain without trusting any funding event. The amount is the
 * claimed leg's escrowed amount. So:
 *   - a trade with a Bitcoin leg is counted through its other leg;
 *   - a refunded leg is never claimed, so it is never counted, and a trade nobody settled adds nothing;
 *   - a same-chain trade (both legs on one chain) is counted once too.
 * Claims are ordered by block time across chains (then block and log index), so an escrow copied from a
 * public hashlock and claimed with the secret once it is out normally lands after the reveal; a copy
 * claimed faster from the mempool can still be picked, and then its amount counts (see known limits).
 * Claims and fundings are read over a 3-day lookback (the protocol's timelocks are 24h and 4h by default);
 * a leg funded earlier is not counted. A secret is revealed only once both legs are funded, so the claim
 * that revealed a counted leg's secret is inside the lookback too, but it can sit on an escrow funded before
 * it: claim() has no deadline (an escrow pays out until someone refunds it). TRON and Solana claims are read
 * from the whole pool / program; on EVM, Claimed is read from every clone the factory created that shares a
 * hashlock with a leg funded inside the lookback, however old the clone.
 *
 * Known limits: an escrow is permissionless, so someone can fund and claim their own escrow (wash volume
 * that costs them gas and locks their own funds, as on any on-chain venue); an escrow funded after its
 * secret was revealed more than 3 days earlier counts as a trade of its own; Solana's blockTime is an
 * estimate, so a same-second race with another chain can be ordered either way.
 *
 * Fees: the protocol fee is paid by the taker on top of the escrowed amount when a leg is funded, goes to
 * the company treasury and is not refunded. Read from FeeCollected (EVM, TRON) and the fee field of Funded
 * (Solana). A fee paid inside a Bitcoin funding transaction is not counted.
 *
 * Solana is read through RPC signatures of the program rather than Dune: the program has a handful of
 * transactions so far, and the hourly pairing needs the same windows on every chain.
 */
import * as sdk from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";
import { createHash } from "crypto";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { base58Encode, getTransaction, solanaRpc } from "../../helpers/solana";
import ADDRESSES from "../../helpers/coreAssets.json";

const FACTORY = "0xa9B6a64837259034E949787B5d17Bfa46304ff71"; // same address on every chain in EVM_CHAINS
const FACTORY_START = "2026-10-05"; // the factory's deployment day on every chain in EVM_CHAINS
const TRON_POOL = sdk.util.tronToEvmAddress("TE97fe1beR5nRZzjixi4azE36qWcHEWmNj");
const SOLANA_PROGRAM = "7Egsecq7YU5n7PonndM7W7W92EFLZVGrnoaNPW8n1DEc";
const EVM_CHAINS: string[] = [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ROBINHOOD];
const LOOKBACK = 3 * 24 * 3600; // default timelocks are 24h (Bitcoin) and 4h (every other chain)

const ABI = {
  SwapCreated: "event SwapCreated(bytes32 indexed swapId, address indexed clone, address indexed token, address recipient, address initiator, uint256 amount, bytes32 hashlock, uint256 timelock)",
  EvmFee: "event FeeCollected(bytes32 indexed swapId, address indexed token, address indexed treasury, uint256 fee)",
  EvmClaimed: "event Claimed(bytes32 secret)",
  TronFunded: "event Funded(bytes32 indexed swapId, address indexed initiator, address indexed recipient, address token, uint256 amount, bytes32 hashlock, uint256 timelock, bytes32 agreedId)",
  TronFee: "event FeeCollected(bytes32 indexed swapId, address indexed treasury, uint256 fee)",
  TronClaimed: "event Claimed(bytes32 indexed swapId, bytes32 secret)",
};

// token null = the chain's native coin
type Leg = { token: string | null; amount: bigint };
// ts: block time in seconds; order: block (or slot) and log index, for claims in the same second
type Claim = { chain: string; leg: string; hashlock: string; ts: number; order: [number, number] };

const ZERO_EVM = ADDRESSES.null;
const ZERO_SOL = "11111111111111111111111111111111"; // Pubkey::default(), the program's mint for native SOL
const lc = (s: any) => String(s).toLowerCase();
const sha256 = (b: Buffer) => "0x" + createHash("sha256").update(b).digest("hex");
const hexBytes = (h: string) => Buffer.from(String(h).replace(/^0x/, ""), "hex");
const evmToken = (t: string) => (lc(t) === ZERO_EVM ? null : lc(t));
const tronToken = (t: string) => (lc(t) === ZERO_EVM ? null : sdk.util.evmToTronAddress(t));

// ── Solana: Anchor events are `Program data: base64(discriminator ‖ borsh fields)` log lines ─────────
const disc = (name: string) => createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);
const SOL_FUNDED = disc("Funded");
const SOL_CLAIMED = disc("Claimed");
const PUBKEY = "[1-9A-HJ-NP-Za-km-z]{32,44}";
const INVOKE = new RegExp(`^Program (${PUBKEY}) invoke \\[\\d+\\]$`);
const EXIT = new RegExp(`^Program ${PUBKEY} (success|failed)`);

// Only lines our program logged itself: the invoke stack is tracked, so another program's data never counts.
function ownEvents(logs: string[] = []): Buffer[] {
  const stack: string[] = [];
  const out: Buffer[] = [];
  for (const line of logs) {
    const invoke = line.match(INVOKE);
    if (invoke) stack.push(invoke[1]);
    else if (EXIT.test(line)) stack.pop();
    else if (line.startsWith("Program data: ") && stack[stack.length - 1] === SOLANA_PROGRAM)
      out.push(Buffer.from(line.slice("Program data: ".length), "base64"));
  }
  return out;
}

type SolEvent =
  | { kind: "funded"; escrow: string; hashlock: string; leg: Leg; fee: bigint }
  | { kind: "claimed"; escrow: string; hashlock: string };

function decodeSolana(b: Buffer): SolEvent | null {
  const d = b.subarray(8);
  if (b.subarray(0, 8).equals(SOL_FUNDED)) {
    // escrow 32 | swap_id 16 | hashlock 32 | recipient 32 | funder 32 | mint 32 | amount u64 | timelock i64 | fee u64
    const mint = base58Encode(d.subarray(144, 176));
    return {
      kind: "funded", escrow: base58Encode(d.subarray(0, 32)), hashlock: "0x" + d.subarray(48, 80).toString("hex"),
      fee: d.readBigUInt64LE(192), leg: { token: mint === ZERO_SOL ? null : mint, amount: d.readBigUInt64LE(176) },
    };
  }
  if (b.subarray(0, 8).equals(SOL_CLAIMED)) {
    // escrow 32 | swap_id 16 | secret: u32 length + bytes
    const len = d.readUInt32LE(48);
    return { kind: "claimed", escrow: base58Encode(d.subarray(0, 32)), hashlock: sha256(d.subarray(52, 52 + len)) };
  }
  return null;
}

// A transaction never changes: each one is fetched and decoded once per process.
const solTxCache = new Map<string, Promise<SolEvent[]>>();
const solTx = (signature: string) => {
  if (!solTxCache.has(signature))
    solTxCache.set(signature, getTransaction({ signature, maxSupportedTransactionVersion: 0 }).then((tx: any) => {
      if (!tx) throw new Error(`hashlock-markets: Solana transaction ${signature} not available`);
      return ownEvents(tx.meta?.logMessages).map(decodeSolana).filter((e): e is SolEvent => !!e);
    }).catch((e) => { solTxCache.delete(signature); throw e; }));
  return solTxCache.get(signature)!;
};

// Program signatures with blockTime in [from, to), newest first from the tip.
async function solanaSignatures(from: number, to: number) {
  const out: { signature: string; blockTime: number; slot: number }[] = [];
  let before: string | undefined;
  for (;;) {
    // The raw call, so a malformed answer throws instead of reading as the end of history.
    // Finalized only: a finalized signature carries its blockTime.
    const page: any[] = await solanaRpc("getSignaturesForAddress", [SOLANA_PROGRAM, { before, limit: 1000, commitment: "finalized" }]);
    if (!Array.isArray(page)) throw new Error("hashlock-markets: Solana getSignaturesForAddress returned no list");
    for (const s of page) {
      if (s.err) continue;
      if (!s.blockTime) throw new Error(`hashlock-markets: Solana signature ${s.signature} has no blockTime`);
      if (s.blockTime >= from && s.blockTime < to) out.push(s);
    }
    const oldest = page[page.length - 1];
    if (page.length < 1000 || (oldest.blockTime && oldest.blockTime < from)) return out;
    before = oldest.signature;
  }
}

// Every chain at once, because whether a claim is a trade's first depends on the other chains' claims.
// runAdapter's hourly window is [start, end] with start = end - 3601, so this run owns (start, end): the
// next run starts at end - 1.
async function prefetch(options: FetchOptions): Promise<any> {
  const { startTimestamp: start, endTimestamp: end } = options;
  const from = start - LOOKBACK;
  const owns = (ts: number) => ts > start && ts < end;
  // Block lookup by time can land minutes early, so events are read 10 minutes past the window and kept or
  // dropped by their own time; capped a minute behind now for the current hour.
  const until = Math.min(end + 600, Math.floor(Date.now() / 1000) - 60);
  const legs = new Map<string, Leg>(); // `${chain}:${leg id}`, legs funded inside the lookback
  const hashlocks = new Set<string>(); // of those legs
  const claims: Claim[] = [];
  const addLeg = (chain: string, id: string, hashlock: string, leg: Leg) => {
    legs.set(`${chain}:${id}`, leg);
    hashlocks.add(lc(hashlock));
  };

  // EVM and TRON logs carry a block number; their time comes from the block.
  const withTime = async (chain: string, logs: any[], toClaim: (l: any) => Omit<Claim, "ts" | "order">) => {
    const blocks = [...new Set(logs.map((l) => Number(l.blockNumber)))];
    const time = new Map<number, number>();
    const { errors } = await PromisePool.withConcurrency(5).for(blocks)
      .process(async (n) => {
        const block = await sdk.getProvider(chain).getBlock(n);
        if (!block) throw new Error(`hashlock-markets: block ${n} on ${chain} not available`);
        time.set(n, Number(block.timestamp));
      });
    if (errors.length) throw errors[0];
    for (const l of logs) {
      const index = Number(l.logIndex ?? l.index);
      if (!Number.isFinite(index)) throw new Error(`hashlock-markets: ${chain} log without a log index, block ${l.blockNumber}`);
      claims.push({ ...toClaim(l), ts: time.get(Number(l.blockNumber))!, order: [Number(l.blockNumber), index] });
    }
  };

  // Every clone since the factory's deployment: an older one can hold the reveal of a leg funded inside the lookback.
  const clones: Record<string, any[]> = {};
  for (const chain of EVM_CHAINS) {
    clones[chain] = await sdk.getEventLogs({ chain, target: FACTORY, eventAbi: ABI.SwapCreated, fromTimestamp: Date.parse(FACTORY_START) / 1000, toTimestamp: until, onlyArgs: false });
    const fromBlock = await options.getBlock(from, chain, {});
    for (const { blockNumber, args: e } of clones[chain])
      if (Number(blockNumber) >= fromBlock) addLeg(chain, lc(e.clone), e.hashlock, { token: evmToken(e.token), amount: BigInt(e.amount) });
  }

  const funded = await sdk.getEventLogs({ chain: CHAIN.TRON, target: TRON_POOL, eventAbi: ABI.TronFunded, fromTimestamp: from, toTimestamp: until, onlyArgs: true });
  for (const e of funded) addLeg(CHAIN.TRON, lc(e.swapId), e.hashlock, { token: tronToken(e.token), amount: BigInt(e.amount) });
  const tronClaimed = await sdk.getEventLogs({ chain: CHAIN.TRON, target: TRON_POOL, eventAbi: ABI.TronClaimed, fromTimestamp: from, toTimestamp: until, onlyArgs: false });
  await withTime(CHAIN.TRON, tronClaimed, (l) => ({ chain: CHAIN.TRON, leg: lc(l.args.swapId), hashlock: sha256(hexBytes(l.args.secret)) }));

  const solanaFees: { token: string | null; fee: bigint }[] = [];
  const sigs = await solanaSignatures(from, until);
  const { results, errors } = await PromisePool.withConcurrency(5).for(sigs)
    .process(async (s) => ({ s, events: await solTx(s.signature) }));
  if (errors.length) throw errors[0];
  for (const { s, events } of results) events.forEach((e, i) => {
    if (e.kind === "funded") {
      addLeg(CHAIN.SOLANA, e.escrow, e.hashlock, e.leg);
      if (owns(s.blockTime) && e.fee > 0n) solanaFees.push({ token: e.leg.token, fee: e.fee });
    } else claims.push({ chain: CHAIN.SOLANA, leg: e.escrow, hashlock: e.hashlock, ts: s.blockTime, order: [s.slot, i] });
  });

  // After every chain's fundings, so the hashlocks are known. Claimed is read only from clones this factory
  // created: a look-alike event elsewhere never counts.
  for (const chain of EVM_CHAINS) {
    const targets = clones[chain].filter((l) => hashlocks.has(lc(l.args.hashlock))).map((l) => l.args.clone);
    if (!targets.length) continue;
    const claimed = await sdk.getEventLogs({ chain, targets, eventAbi: ABI.EvmClaimed, fromTimestamp: from, toTimestamp: until, onlyArgs: false, flatten: true });
    await withTime(chain, claimed, (l) => ({ chain, leg: lc(l.address), hashlock: sha256(hexBytes(l.args.secret)) }));
  }

  // The first claim of each hashlock is the reveal; it counts in the run that owns its time.
  const first = new Map<string, Claim>();
  const earlier = (a: Claim, b: Claim) =>
    a.ts !== b.ts ? a.ts < b.ts : a.chain !== b.chain ? a.chain < b.chain : a.order[0] !== b.order[0] ? a.order[0] < b.order[0]
      : a.order[1] !== b.order[1] ? a.order[1] < b.order[1] : a.leg < b.leg; // last: the escrow id, so a rerun picks the same
  for (const c of claims) {
    const cur = first.get(c.hashlock);
    if (!cur || earlier(c, cur)) first.set(c.hashlock, c);
  }
  const volume: { chain: string; leg: Leg }[] = [];
  for (const c of first.values()) {
    const leg = legs.get(`${c.chain}:${c.leg}`);
    if (leg && owns(c.ts)) volume.push({ chain: c.chain, leg }); // no leg: funded before the lookback
  }

  return { volume, solanaFees };
}

const addTo = (b: sdk.Balances, token: string | null, amount: bigint, label?: string) =>
  token === null ? b.addGasToken(amount, label) : b.add(token, amount, label);

const FEE_LABEL = METRIC.SWAP_FEES;
const REVENUE_LABEL = "Token Swap Fees To Treasury";

async function fetch(options: FetchOptions) {
  const { chain, preFetchedResults: pre } = options;
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const fee = (token: string | null, amount: bigint) => {
    addTo(dailyFees, token, amount, FEE_LABEL);
    addTo(dailyRevenue, token, amount, REVENUE_LABEL);
  };

  for (const v of pre.volume) if (v.chain === chain) addTo(dailyVolume, v.leg.token, v.leg.amount);

  // options.getLogs reads [fromBlock, toBlock] and the next hour starts on this hour's toBlock: start one
  // block later so a boundary block is counted once.
  const fromBlock = (await options.getFromBlock()) + 1;
  if (EVM_CHAINS.includes(chain)) {
    for (const f of await options.getLogs({ target: FACTORY, eventAbi: ABI.EvmFee, fromBlock })) fee(evmToken(f.token), BigInt(f.fee));
  } else if (chain === CHAIN.TRON) {
    // FeeCollected carries no token; the Funded event of the same swap, in the same transaction, names it,
    // so both are read over the same blocks.
    const fees = await options.getLogs({ target: TRON_POOL, eventAbi: ABI.TronFee, fromBlock });
    const funded = await options.getLogs({ target: TRON_POOL, eventAbi: ABI.TronFunded, fromBlock });
    const tokenOf = new Map(funded.map((e: any) => [lc(e.swapId), tronToken(e.token)]));
    for (const f of fees) {
      if (!tokenOf.has(lc(f.swapId))) throw new Error(`hashlock-markets: TRON fee without its Funded event, swap ${f.swapId}`);
      fee(tokenOf.get(lc(f.swapId))!, BigInt(f.fee));
    }
  } else if (chain === CHAIN.SOLANA) {
    for (const f of pre.solanaFees) fee(f.token, f.fee);
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
}

const methodology = {
  Volume: "Settled trade volume. Each trade is counted once, at the first claim of its hashlock (the claim that reveals the secret, ordered by block time across chains), at that leg's escrowed amount; refunded legs and unsettled trades are not counted. A trade with a Bitcoin leg is counted through its other leg.",
  Fees: "Protocol fee paid by the taker when a leg is funded, on top of the escrowed amount (FeeCollected on EVM and TRON, the fee field of Funded on Solana). It is not refunded.",
  Revenue: "All protocol fees (Fees paid by the taker when a leg is funded) go to the Hashlock Markets treasury.",
  ProtocolRevenue: "All protocol fees (Fees paid by the taker when a leg is funded) go to the Hashlock Markets treasury.",
};

const breakdownMethodology = {
  Fees: { [FEE_LABEL]: "Protocol fee on each funded leg, paid by the taker." },
  Revenue: { [REVENUE_LABEL]: "Protocol fee on each funded leg, kept by the Hashlock Markets treasury." },
  ProtocolRevenue: { [REVENUE_LABEL]: "Protocol fee on each funded leg, kept by the Hashlock Markets treasury." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  prefetch,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: FACTORY_START },
    [CHAIN.BASE]: { start: FACTORY_START },
    [CHAIN.ROBINHOOD]: { start: FACTORY_START },
    [CHAIN.TRON]: { start: "2026-10-07" },
    [CHAIN.SOLANA]: { start: "2026-10-05" },
  },
};

export default adapter;
