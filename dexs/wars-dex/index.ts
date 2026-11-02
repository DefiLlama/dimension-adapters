import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { httpGet } from "../../utils/fetchURL";

// WARs DEX: constant-product (x*y=k) pools of two fungible assets on Supra. https://dex.supwars.fun
// Contracts: https://github.com/aos-ftw/wars-platform/tree/mainnet-supwars/chains/supra/contracts-dex
const RPC = "https://rpc-mainnet.supra.com";
const WARS_DEX = "0xe30a26a598182ea2e7d8b984d261ecca63c595e1c0c8a9b5f8b51b7387ed4c48";
const SWAP_EVENT = `${WARS_DEX}::wars_pool::Swap`;
// The part of a swap's fee that leaves the pool in the same transaction: the protocol share to the treasury, or on a
// pool seeded by the WARs Floor launchpad the platform's share. The rest of the fee stays in the pool for its LPs.
const CUT_EVENT = `${WARS_DEX}::wars_pool::PlatformCut`;
const SUPRA_FA = "0xa"; // the SUPRA coin's paired fungible asset; a pool with SUPRA charges its fee in SUPRA
const PAGE = 100; // the most events /rpc/v3/events returns a page
const FIRST_SWAP_BLOCK = 56067509; // the first wars_pool::Swap on mainnet (2026-10-14), a floor for the block search

const blockTime = async (height: number): Promise<number> => {
  const block = await httpGet(`${RPC}/rpc/v1/block/height/${height}`);
  return Math.floor(Number(block.header.timestamp.microseconds_since_unix_epoch) / 1e6);
};

// The first block at or after `ts` (unix seconds): interpolation search over block heights (blocks come about once a
// second, so it lands within a few reads), falling back to halving when a guess does not narrow the range enough.
const blockAt = async (ts: number, latest: { height: number; time: number }): Promise<number> => {
  if (ts > latest.time) return latest.height + 1;
  let lo = FIRST_SWAP_BLOCK, loT = await blockTime(lo);
  if (ts <= loT) return lo;
  let hi = latest.height, hiT = latest.time; // invariant: time(lo) < ts <= time(hi)
  while (hi - lo > 1) {
    let mid = lo + Math.round(((ts - loT) / (hiT - loT)) * (hi - lo));
    if (mid <= lo || mid >= hi || (hi - lo) < 64) mid = Math.floor((lo + hi) / 2);
    const t = await blockTime(mid);
    if (t < ts) { lo = mid; loT = t; } else { hi = mid; hiT = t; }
  }
  return hi;
};

// Every event of `type` in blocks [from, to), oldest first.
const getEvents = async (type: string, from: number, to: number): Promise<any[]> => {
  const out: any[] = [];
  if (from >= to) return out;
  let cursor = "";
  while (true) {
    const url = `${RPC}/rpc/v3/events/${encodeURIComponent(type)}?limit=${PAGE}&start_height=${from}&end_height=${to}${cursor ? `&start=${cursor}` : ""}`;
    const res = await httpGet(url, undefined, { withMetadata: true });
    const list = res.data?.data ?? [];
    out.push(...list);
    const next = String(res.headers["x-supra-cursor"] ?? "");
    // keep reading while the feed hands back a new cursor; an empty page or a missing/unchanged cursor ends it
    if (!list.length || !next || next === cursor) break;
    cursor = next;
  }
  return out;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const head = await httpGet(`${RPC}/rpc/v3/block`);
  const latest = { height: Number(head.header.height), time: Math.floor(Number(head.header.timestamp.microseconds_since_unix_epoch) / 1e6) };
  const from = await blockAt(options.startTimestamp, latest);
  const to = await blockAt(options.endTimestamp, latest);

  const swaps = await getEvents(SWAP_EVENT, from, to);
  const cuts = await getEvents(CUT_EVENT, from, to);

  // the asset each swap's fee was charged in, by transaction and pool, for its PlatformCut
  const feeAsset: Record<string, string> = {};
  const lpFees: Record<string, bigint> = {}; // by fee asset: the fee less its cut
  // a coin amount: SUPRA goes in whole SUPRA (8 decimals) by its CoinGecko id, any other fungible asset by its address
  const add = (balances: any, asset: string, amount: bigint, label?: string) => {
    if (amount <= 0n) return;
    if (asset === SUPRA_FA) balances.addCGToken("supra", Number(amount) / 1e8, label);
    else balances.add(asset, amount.toString(), label);
  };

  for (const e of swaps) {
    const s = e.event.data;
    const withSupra = s.asset_in === SUPRA_FA || s.asset_out === SUPRA_FA;
    const fee = BigInt(s.fee);
    // volume is gross of the fee: SUPRA paid in includes it; SUPRA paid out is net of it (the fee is charged on the
    // output), so the fee is added back; a pool without SUPRA charges the fee on the input, so amount_in includes it
    if (s.asset_in === SUPRA_FA) add(dailyVolume, SUPRA_FA, BigInt(s.amount_in));
    else if (s.asset_out === SUPRA_FA) add(dailyVolume, SUPRA_FA, BigInt(s.amount_out) + fee);
    else add(dailyVolume, s.asset_in, BigInt(s.amount_in));
    const asset = withSupra ? SUPRA_FA : s.asset_in;
    feeAsset[`${e.transaction_hash}|${s.pool}`] = asset;
    add(dailyFees, asset, fee, METRIC.SWAP_FEES);
    lpFees[asset] = (lpFees[asset] ?? 0n) + fee; // the cut below comes off this
  }

  for (const e of cuts) {
    const c = e.event.data;
    const asset = feeAsset[`${e.transaction_hash}|${c.pool}`];
    if (!asset) throw new Error(`PlatformCut without a swap in ${e.transaction_hash}`);
    const amount = BigInt(c.amount);
    add(dailyRevenue, asset, amount, METRIC.PROTOCOL_FEES);
    lpFees[asset] -= amount;
  }
  for (const [asset, amount] of Object.entries(lpFees)) add(dailySupplySideRevenue, asset, amount, METRIC.LP_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Every swap through a WARs DEX pool, from the wars_pool::Swap events, gross of the swap fee. A multi-hop route counts once per pool it passes through.",
  Fees: "The swap fee each pool charges (0.05%, 0.30% or 1.00%, fixed when the pool is created), in SUPRA on a pool with SUPRA, else in the asset paid in.",
  UserFees: "Traders pay every swap fee.",
  Revenue: "The share of each fee that leaves the pool in the same transaction (wars_pool::PlatformCut events): the protocol share to the WARs DEX treasury (at most half of the fee), or on a pool seeded by the WARs Floor launchpad the platform's share.",
  ProtocolRevenue: "All revenue goes to the WARs treasury and platform wallets.",
  SupplySideRevenue: "The rest of each fee stays in the pool for its liquidity providers.",
};

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Swap fees paid by traders." },
  Revenue: { [METRIC.PROTOCOL_FEES]: "The treasury's or the Floor platform's share of swap fees." },
  SupplySideRevenue: { [METRIC.LP_FEES]: "Swap fees kept by liquidity providers." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUPRA],
  start: "2026-10-14",
  methodology,
  breakdownMethodology,
};

export default adapter;
