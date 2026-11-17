import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

// Bifrost's API fee is derived, not measured: fee = revenue + 9 * vTokenCommission, i.e. it assumes staking rewards are
// 10x the commission. Since 2026-07-07 Bifrost no longer mints the 10% commission on vDOT rewards (VtokenMinting.TokenPool
// grows while Tokens.TotalIssuance of vDOT does not), so that formula drops ~85% of the staking rewards. Where the overview
// endpoint has the vToken exchange rates (a rolling 365 days), rewards are measured from them instead.
const CG_IDS: Record<string, string> = {
  DOT: "polkadot",
  KSM: "kusama",
  GLMR: "moonbeam",
  MOVR: "moonriver",
  ASTR: "astar",
  MANTA: "manta-network",
  BNC: "bifrost-native-coin",
  ETH: "ethereum",
  FIL: "filecoin",
};

// the overview only keeps the last 365 days (2025-11-17 onwards when this was written), dates from here on need it
const OVERVIEW_START = "2025-12-01";

// vDOT and most vTokens are snapshotted once a day at a varying time, sometimes before and sometimes after the daily
// reward, so their rate is taken over the last 7 snapshots to avoid 0 and 2x days. vETH, vGLMR and vMOVR snapshots only
// move when their exchange rate does (every few weeks), those are booked on the day the new rate shows up.
const RATE_WINDOW = 7;
const SPARSE_SNAPSHOTS = new Set(["ETH", "GLMR", "MOVR"]);
const DAY = 86400;

let overview: any;

const fetchFromStats = async (options: FetchOptions) => {
  const res = await fetchURL('https://dapi.bifrost.io/api/dapp/stats')
  const { dailyFees, dailyRevenue, } = res.find(v => v.date === options.dateString)

  return { dailyFees, dailyRevenue, };
};

const fetch = async (options: FetchOptions) => {
  // older dates were never in the overview window, only the API's own figure exists for them
  if (options.dateString < OVERVIEW_START) return fetchFromStats(options);

  if (!overview)
    overview = fetchURL('https://dapi.bifrost.io/api/dapp/stats/overview').catch((e: any) => { overview = undefined; throw e; });
  const days = (await overview).slice().sort((a: any, b: any) => a.date.localeCompare(b.date));
  if (options.dateString < days[RATE_WINDOW].date)
    throw new Error(`${options.dateString} is no longer in the Bifrost overview window (last 365 days)`);
  const i = days.findIndex((v: any) => v.date === options.dateString);
  if (i < 0) throw new Error(`No Bifrost overview data for ${options.dateString}`);
  const today = days[i], prev = days[i - 1];
  const dayLength = options.toTimestamp - options.fromTimestamp;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // vDOT is ~85% of the rewards and updates daily: a stale vDOT snapshot means the API stopped indexing
  const dot = today.vtokens.DOT;
  if (!dot || options.toTimestamp - Date.parse(dot.timestamp) / 1e3 > 2 * DAY)
    throw new Error(`Stale Bifrost vDOT snapshot for ${options.dateString}`);

  // staking rewards accrued to vToken holders: exchange rate growth times the pool backing the vTokens
  // (ratio = pool / vToken supply, tvs = pool in underlying token units)
  for (const [symbol, v] of Object.entries<any>(today.vtokens)) {
    const p = prev.vtokens[symbol];
    if (!p) continue;
    let growth = Number(v.ratio) / Number(p.ratio) - 1;
    const old = days[i - RATE_WINDOW].vtokens[symbol];
    if (!SPARSE_SNAPSHOTS.has(symbol) && old) {
      const elapsed = (Date.parse(v.timestamp) - Date.parse(old.timestamp)) / 1e3;
      if (!(elapsed > 0)) throw new Error(`Stale Bifrost v${symbol} snapshots for ${options.dateString}`);
      growth = (Number(v.ratio) / Number(old.ratio) - 1) * dayLength / elapsed;
    }
    const rewards = Number(p.tvs) * growth;
    if (!rewards) continue;
    if (!CG_IDS[symbol]) throw new Error(`Unknown Bifrost vToken ${symbol}`);
    dailyFees.addCGToken(CG_IDS[symbol], rewards, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addCGToken(CG_IDS[symbol], rewards, METRIC.STAKING_REWARDS);
  }

  // vToken commission is minted to Bifrost on top of what holders get (still 10% on vASTR, vKSM...)
  dailyFees.addUSDValue(+today.vTokenCommission, 'Staking Rewards Commission');
  dailyRevenue.addUSDValue(+today.vTokenCommission, 'Staking Rewards Commission');

  // the SystemStaking pallet holds protocol-owned vDOT, its share of the rewards above goes to Bifrost, not to users
  dailyFees.addUSDValue(-today.systemStaking, METRIC.STAKING_REWARDS);
  dailyFees.addUSDValue(+today.systemStaking, 'System Staking Rewards');
  dailySupplySideRevenue.addUSDValue(-today.systemStaking, METRIC.STAKING_REWARDS);
  dailyRevenue.addUSDValue(+today.systemStaking, 'System Staking Rewards');

  // tx fees (txFee) are left out, bifrost-chain already counts them
  dailyFees.addUSDValue(+today.redeemedFee, METRIC.MINT_REDEEM_FEES);
  dailyRevenue.addUSDValue(+today.redeemedFee, METRIC.MINT_REDEEM_FEES);
  dailyFees.addUSDValue(+today.stableAssetFee, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(+today.stableAssetFee, METRIC.SWAP_FEES);
  dailyFees.addUSDValue(+today.channelCommission, 'Channel Commission');
  dailyRevenue.addUSDValue(+today.channelCommission, 'Channel Commission');

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue, };
};


const methodology = {
  Fees: "Staking rewards earned by Bifrost vTokens (vDOT, vKSM, vASTR, vBNC, vMANTA, vGLMR...), plus fast redeem fees, stable swap fees and channel commission. For dates covered by Bifrost's overview endpoint (a rolling 365 days) rewards are the vToken exchange rate growth (over the last 7 daily snapshots for vTokens that are snapshotted daily) times the pool backing the vTokens, plus the commission Bifrost mints. Older dates use Bifrost's API figure, which grosses the vToken commission up 10x.",
  Revenue: "The vToken commission minted to Bifrost, rewards on the protocol-owned vDOT held by the SystemStaking pallet, fast redeem fees, stable swap fees and channel commission.",
  ProtocolRevenue: "The vToken commission minted to Bifrost, rewards on the protocol-owned vDOT held by the SystemStaking pallet, fast redeem fees, stable swap fees and channel commission.",
  SupplySideRevenue: "Staking rewards accrued to vToken holders through the vToken exchange rate, excluding the protocol-owned vDOT held by the SystemStaking pallet.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Staking rewards accrued to vToken holders: exchange rate growth times the pool backing the vTokens, excluding the protocol-owned vDOT held by the SystemStaking pallet.",
    'Staking Rewards Commission': "The commission on staking rewards minted as vTokens to Bifrost (10% on vASTR, vKSM and others, none on vDOT since 2026-07-07).",
    'System Staking Rewards': "Staking rewards on the protocol-owned vDOT held by the SystemStaking pallet.",
    [METRIC.MINT_REDEEM_FEES]: "Fast redeem fees paid by users.",
    [METRIC.SWAP_FEES]: "Fees from Bifrost stable swap pools.",
    'Channel Commission': "Channel commission reported by Bifrost.",
  },
  Revenue: {
    'Staking Rewards Commission': "The commission on staking rewards minted as vTokens to Bifrost (10% on vASTR, vKSM and others, none on vDOT since 2026-07-07).",
    'System Staking Rewards': "Staking rewards on the protocol-owned vDOT held by the SystemStaking pallet.",
    [METRIC.MINT_REDEEM_FEES]: "Fast redeem fees paid by users, kept by Bifrost.",
    [METRIC.SWAP_FEES]: "Fees from Bifrost stable swap pools, kept by Bifrost.",
    'Channel Commission': "Channel commission reported by Bifrost.",
  },
  ProtocolRevenue: {
    'Staking Rewards Commission': "The commission on staking rewards minted as vTokens to Bifrost (10% on vASTR, vKSM and others, none on vDOT since 2026-07-07).",
    'System Staking Rewards': "Staking rewards on the protocol-owned vDOT held by the SystemStaking pallet.",
    [METRIC.MINT_REDEEM_FEES]: "Fast redeem fees paid by users, kept by Bifrost.",
    [METRIC.SWAP_FEES]: "Fees from Bifrost stable swap pools, kept by Bifrost.",
    'Channel Commission': "Channel commission reported by Bifrost.",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: "Staking rewards accrued to vToken holders through the vToken exchange rate, excluding the protocol-owned vDOT held by the SystemStaking pallet.",
  },
};

const adapter: any = {
  version: 1,
  fetch,
  chains: [CHAIN.BIFROST],
  start: '2022-01-01',
  methodology,
  breakdownMethodology,
};

export default adapter;
