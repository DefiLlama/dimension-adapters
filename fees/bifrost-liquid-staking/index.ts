import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import fetchURL, { postURL } from "../../utils/fetchURL";

// Bifrost's API fee is derived, not measured: fee = revenue + 9 * vTokenCommission, i.e. it assumes staking rewards are
// 10x the commission. Since 2026-07-07 Bifrost no longer mints the 10% commission on vDOT rewards (VtokenMinting.TokenPool
// grows while Tokens.TotalIssuance of vDOT does not), so that formula drops ~85% of the staking rewards. Rewards are
// measured on chain instead, the USD commission and fee lines come from the overview endpoint.
const DAY = 86400;

// Bifrost Polkadot archive node (the public Bifrost Kusama nodes prune old state)
const RPC = "https://eu.bifrost-polkadot-rpc.liebi.com";
// last block before 2025-11-17 00:00 UTC (2025-11-16 23:59:54), before the earliest day the overview served when this was
// written, lower bound for the block search (the window only moves forward)
const SEARCH_FROM_BLOCK = 10002910;

// storage keys: twox128(pallet) ++ twox128(item) ++ twox64(currencyId) ++ currencyId
const TIMESTAMP_NOW_KEY = "0xf0c365c3cf59d671eb72da0e7a4113c49f1f0515f462cdcf84e0f1d6045dfcbb"; // Timestamp.Now
const TOKEN_POOL = "0xe3796c00fc79220626ff282d21ad57673bc8ac1b518467837ce0324d4288854e"; // VtokenMinting.TokenPool
const TOTAL_ISSUANCE = "0x99971b5749ac43e0235e41b0d378691857c875e4cff74148e4628f264b974c80"; // Tokens.TotalIssuance
// Tokens.Accounts(SystemStaking pallet account, vDOT): twox128 ++ twox128 ++ blake2_128(account) ++ account ++ twox64(vDOT)
// ++ vDOT, account = b"modl" ++ b"bf/sysst" padded to 32 bytes. It holds protocol-owned vDOT, its rewards go to Bifrost.
const SYSTEM_STAKING_VDOT = "0x99971b5749ac43e0235e41b0d37869188ee7418a6531173d60d1f6a82d8f4d51e1c15d78876f57f08bfb0d1ef96459246d6f646c62662f73797373740000000000000000000000000000000000000000d7711bfe851930780900";

// Bifrost Polkadot vTokens: currency id (VToken2(n) = 0x09nn, VToken(BNC) = 0x0101) with its twox64 hash, and the
// decimals of the underlying token
const VTOKENS = [
  { symbol: "DOT", cgId: "polkadot", id: "d7711bfe851930780900", decimals: 10 },
  { symbol: "GLMR", cgId: "moonbeam", id: "759191d2a31597a60901", decimals: 18 },
  { symbol: "ASTR", cgId: "astar", id: "b788e2160690b0a90903", decimals: 18 },
  { symbol: "MANTA", cgId: "manta-network", id: "aef9d65dd8dd7c600908", decimals: 18 },
  { symbol: "BNC", cgId: "bifrost-native-coin", id: "7a993ca12348fc520101", decimals: 12 },
];

// vKSM and vMOVR live on Bifrost Kusama, read from the overview snapshots instead. vKSM is snapshotted at ~18:40-18:55
// UTC, after its daily reward, so the change between two consecutive daily snapshots is that day's reward. The vMOVR rate
// hasn't moved since 2026-03-04. vETH is left out: its overview rate hasn't moved since 2026-06-18 and its
// on-chain supply on Bifrost (~325 vETH) is not the one behind the overview rate (~531 vETH, mostly issued off Bifrost).
const OVERVIEW_VTOKENS: Record<string, string> = { KSM: "kusama", MOVR: "moonriver" };

const STAKING_REWARDS_TO_HOLDERS = 'Staking Rewards To vToken Holders';

async function rpc(method: string, params: any[]) {
  const res = await postURL(RPC, { jsonrpc: "2.0", id: 1, method, params });
  if (res.error) throw new Error(`bifrost rpc ${method} failed: ${JSON.stringify(res.error)}`);
  return res.result;
}

// little-endian unsigned int from the first (up to 16) bytes of a SCALE hex value: u64 timestamp, u128 balance, or the
// `free` u128 of an orml AccountData { free, reserved, frozen }
const leUint = (hex: string) => BigInt("0x" + (hex.slice(2, 34).match(/../g) ?? []).reverse().join(""));

async function storageAt(keys: string[], hash: string): Promise<(bigint | null)[]> {
  const [{ changes }] = await rpc("state_queryStorageAt", [keys, hash]);
  const values = new Map<string, string | null>(changes);
  return keys.map((k) => { const v = values.get(k); return v ? leUint(v) : null; });
}

const blockTime = async (block: number) => {
  const hash = await rpc("chain_getBlockHash", [block]);
  const [now] = await storageAt([TIMESTAMP_NOW_KEY], hash);
  if (now === null) throw new Error(`bifrost: no timestamp at block ${block}`);
  return Number(now) / 1e3;
};

type BlockTime = { block: number; time: number };

// last block with a timestamp before ts, searched between lo (time < ts) and hi (time >= ts) by interpolation with a
// bisection fallback
async function lastBlockBefore(ts: number, lo: BlockTime, hi: BlockTime): Promise<BlockTime> {
  if (hi.time < ts) throw new Error(`bifrost: finalized head ${hi.block} is before ${ts}`);
  if (lo.time >= ts) throw new Error(`bifrost: ${ts} is before block ${lo.block}`);
  for (let i = 0; hi.block - lo.block > 1; i++) {
    let next = Math.floor((lo.block + hi.block) / 2);
    if (i % 2 === 0) next = Math.min(hi.block - 1, Math.max(lo.block + 1, lo.block + Math.floor((ts - lo.time) * (hi.block - lo.block) / (hi.time - lo.time))));
    const time = await blockTime(next);
    if (time < ts) lo = { block: next, time };
    else hi = { block: next, time };
  }
  return lo;
}

// pool and vToken supply of every vToken at the end of the day before and at the end of this day
async function vTokenStates(options: FetchOptions) {
  const keys = [...VTOKENS.flatMap((t) => [TOKEN_POOL + t.id, TOTAL_ISSUANCE + t.id]), SYSTEM_STAKING_VDOT];
  const head = parseInt((await rpc("chain_getHeader", [await rpc("chain_getFinalizedHead", [])])).number, 16);
  const hi = { block: head, time: await blockTime(head) };
  // sequential on purpose, the public node answers bursts of parallel requests with 503s
  const startBlock = await lastBlockBefore(options.startOfDay, { block: SEARCH_FROM_BLOCK, time: await blockTime(SEARCH_FROM_BLOCK) }, hi);
  const endBlock = await lastBlockBefore(options.startOfDay + DAY, startBlock, hi);
  const start = await storageAt(keys, await rpc("chain_getBlockHash", [startBlock.block]));
  const end = await storageAt(keys, await rpc("chain_getBlockHash", [endBlock.block]));
  const tokens = VTOKENS.map((t, i) => ({ ...t, pool0: start[2 * i], supply0: start[2 * i + 1], pool1: end[2 * i], supply1: end[2 * i + 1] }));
  return { tokens, systemStakingVdot: end[keys.length - 1] ?? 0n };
}

let overview: any;

// a numeric overview field, throws when the API drops or renames it instead of storing NaN or 0
const num = (row: any, field: string) => {
  const v = Number(row?.[field]);
  if (row?.[field] == null || row[field] === "" || !Number.isFinite(v)) throw new Error(`Bifrost overview: bad ${field} for ${row?.date}`);
  return v;
};

const fetch = async (options: FetchOptions) => {
  if (!overview)
    overview = fetchURL('https://dapi.bifrost.io/api/dapp/stats/overview').catch((e: any) => { overview = undefined; throw e; });
  const days = (await overview).slice().sort((a: any, b: any) => a.date.localeCompare(b.date));
  const i = days.findIndex((v: any) => v.date === options.dateString);
  const today = days[i], prev = days[i - 1];
  if (!today || !prev) throw new Error(`No Bifrost overview data for ${options.dateString} (it keeps the last 365 days)`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // staking rewards accrued to vToken holders: exchange rate (pool / vToken supply) growth over the day times the
  // vTokens outstanding at the end of it, i.e. the pool growth that mints and redeems at the opening rate don't explain.
  // Read on chain at the day boundaries so each daily reward lands on its own day (the overview snapshots are taken at a
  const { tokens, systemStakingVdot } = await vTokenStates(options);
  for (const t of tokens) {
    if (t.pool0 === null || t.supply0 === null || t.pool1 === null || t.supply1 === null)
      throw new Error(`Missing Bifrost v${t.symbol} pool or supply for ${options.dateString}`);
    if (!t.supply0) continue; // no vTokens outstanding at the start of the day
    const rewards = Number(t.pool1 - t.pool0 * t.supply1 / t.supply0) / 10 ** t.decimals;
    if (!rewards) continue;
    dailyFees.addCGToken(t.cgId, rewards, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addCGToken(t.cgId, rewards, STAKING_REWARDS_TO_HOLDERS);
    if (t.symbol !== "DOT" || !t.supply1) continue;
    // the SystemStaking pallet's share of the vDOT rewards goes to Bifrost, not to users
    const system = rewards * Number(systemStakingVdot) / Number(t.supply1);
    dailyFees.addCGToken(t.cgId, -system, METRIC.STAKING_REWARDS);
    dailyFees.addCGToken(t.cgId, system, 'System Staking Rewards');
    dailySupplySideRevenue.addCGToken(t.cgId, -system, STAKING_REWARDS_TO_HOLDERS);
    dailyRevenue.addCGToken(t.cgId, system, 'System Staking Rewards');
  }

  for (const [symbol, cgId] of Object.entries(OVERVIEW_VTOKENS)) {
    const v = today.vtokens[symbol], p = prev.vtokens[symbol];
    if (!v || !p) throw new Error(`No Bifrost v${symbol} snapshot for ${options.dateString}`);
    const rewards = num(p, "tvs") * (num(v, "ratio") / num(p, "ratio") - 1);
    if (!rewards) continue;
    // a rate change between snapshots that aren't one day apart would put several days of rewards on one day
    const gap = (Date.parse(v.timestamp) - Date.parse(p.timestamp)) / 1e3;
    if (Date.parse(today.date) - Date.parse(prev.date) !== DAY * 1e3 || !(gap > 0 && gap <= 2 * DAY))
      throw new Error(`Bifrost v${symbol} snapshots for ${options.dateString} are not one day apart`);
    dailyFees.addCGToken(cgId, rewards, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addCGToken(cgId, rewards, STAKING_REWARDS_TO_HOLDERS);
  }

  const commission = num(today, "vTokenCommission"), channelCommission = num(today, "channelCommission");
  dailyFees.addUSDValue(commission, 'Staking Rewards Commission');
  dailyRevenue.addUSDValue(commission - channelCommission, 'Staking Rewards Commission');
  dailySupplySideRevenue.addUSDValue(channelCommission, 'Staking Rewards Commission To Channels');

  // tx fees (txFee) are left out, bifrost-chain already counts them
  dailyFees.addUSDValue(num(today, "redeemedFee"), METRIC.MINT_REDEEM_FEES);
  dailyRevenue.addUSDValue(num(today, "redeemedFee"), METRIC.MINT_REDEEM_FEES);
  dailyFees.addUSDValue(num(today, "stableAssetFee"), METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(num(today, "stableAssetFee"), METRIC.SWAP_FEES);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue, };
};


const methodology = {
  Fees: "Staking rewards earned on tokens staked through Bifrost (vDOT, vKSM, vASTR, vBNC, vMANTA, vGLMR, vMOVR; vETH not counted) including Bifrost's commission, plus fast redeem fees and stable swap fees.",
  Revenue: "Bifrost's commission on staking rewards after the share paid to partner channels, staking rewards on the vDOT Bifrost owns, fast redeem fees and stable swap fees.",
  ProtocolRevenue: "Bifrost's commission on staking rewards after the share paid to partner channels, staking rewards on the vDOT Bifrost owns, fast redeem fees and stable swap fees, all kept by Bifrost.",
  SupplySideRevenue: "Staking rewards passed to vToken holders, plus the share of Bifrost's commission paid to partner channels.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Staking rewards passed to vToken holders through the vToken exchange rate (excluding the vDOT Bifrost owns).",
    'Staking Rewards Commission': "Bifrost's commission on staking rewards, minted to it as vTokens (10% on vASTR, vKSM and others; none on vDOT since 2026-07-07).",
    'System Staking Rewards': "Staking rewards earned by the vDOT Bifrost owns through its SystemStaking pallet.",
    [METRIC.MINT_REDEEM_FEES]: "Fast redeem fees paid by users.",
    [METRIC.SWAP_FEES]: "Swap fees on Bifrost stable swap pools (0.05% on vDOT/DOT, 0.3% on the others), minted to the pool's fee recipient, not to LPs.",
  },
  Revenue: {
    'Staking Rewards Commission': "Bifrost's commission on staking rewards, minus the share paid to partner channels.",
    'System Staking Rewards': "Staking rewards earned by the vDOT Bifrost owns through its SystemStaking pallet.",
    [METRIC.MINT_REDEEM_FEES]: "Fast redeem fees paid by users, kept by Bifrost.",
    [METRIC.SWAP_FEES]: "Swap fees on Bifrost stable swap pools, all kept by Bifrost (LPs get no share).",
  },
  ProtocolRevenue: {
    'Staking Rewards Commission': "Bifrost's commission on staking rewards, minus the share paid to partner channels.",
    'System Staking Rewards': "Staking rewards earned by the vDOT Bifrost owns through its SystemStaking pallet.",
    [METRIC.MINT_REDEEM_FEES]: "Fast redeem fees paid by users, kept by Bifrost.",
    [METRIC.SWAP_FEES]: "Swap fees on Bifrost stable swap pools, all kept by Bifrost (LPs get no share).",
  },
  SupplySideRevenue: {
    [STAKING_REWARDS_TO_HOLDERS]: "Staking rewards passed to vToken holders through the vToken exchange rate (excluding the vDOT Bifrost owns).",
    'Staking Rewards Commission To Channels': "The share of Bifrost's staking rewards commission paid to the partner channels users minted vTokens through.",
  },
};

const adapter: any = {
  version: 1,
  fetch,
  chains: [CHAIN.BIFROST],
  start: '2022-01-01',
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // a vToken exchange rate drop (slash) is a realized loss passed to vToken holders
};

export default adapter;
