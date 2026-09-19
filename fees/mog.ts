import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// mog (https://mog.xyz) - treasury-backed perps on Robinhood Chain, up to 1000x, no LPs.
// Traders face the protocol treasury: losses accrue to it (and mint MOG), profits are paid from it.
// Contracts (unverified proxies; ABI taken from the app bundle), see https://docs.mog.xyz/trading/fees
const CORE = "0x11c0c0007abed9ef5dfa3df1d726b4fd271c52ea";
const MARKETS = "0xBaF66148476F57F50f154a7f77F1AEF82Ce7F24c";

// All amounts are USDG in 1e18 wad units.
const OPEN_FEE_RELEASED = "event OpenFeeReleased(address indexed to, uint256 fee, bool refunded)";
const WIN_SETTLED = "event WinSettled(uint16 indexed mkt, address indexed owner, uint64 indexed cohortId, uint64 posId, uint256 r, uint256 face, uint256 fee)";
const FILLED = "event Filled(uint16 indexed mkt, uint64 indexed posId, address indexed owner, uint8 side, uint128 m, uint128 r, uint128 fillMark, uint64 nonce)";
const FILLED_TERMS = "event FilledTerms(uint16 indexed mkt, uint64 indexed posId, uint128 downLevel, uint128 upLevel, bool near, uint16 lev, uint256 kWad)";

const PROFIT_FEE_BUYBACK_SHARE = 0.7; // https://docs.mog.xyz/mog/buybacks-and-burns
const OPEN_FEES = "Open Fees";
const PROFIT_FEES = "Profit Fees";
const wad = (x: any) => Number(x) / 1e18;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const [openFees, wins, fills, terms] = await Promise.all([
    options.getLogs({ target: CORE, eventAbi: OPEN_FEE_RELEASED }),
    options.getLogs({ target: CORE, eventAbi: WIN_SETTLED }),
    options.getLogs({ target: MARKETS, eventAbi: FILLED }),
    options.getLogs({ target: MARKETS, eventAbi: FILLED_TERMS }),
  ]);

  // flat 0.5 USDG per order, refunded on cancel/expiry, otherwise 100% to protocol operations
  for (const log of openFees) {
    if (log.refunded) continue;
    dailyFees.addUSDValue(wad(log.fee), OPEN_FEES);
    dailyProtocolRevenue.addUSDValue(wad(log.fee), OPEN_FEES);
  }

  // 5% of settled profit: 70% to MOG buyback and burn, 30% to protocol operations
  for (const log of wins) {
    const fee = wad(log.fee);
    dailyFees.addUSDValue(fee, PROFIT_FEES);
    dailyHoldersRevenue.addUSDValue(fee * PROFIT_FEE_BUYBACK_SHARE, METRIC.TOKEN_BUY_BACK);
    dailyProtocolRevenue.addUSDValue(fee * (1 - PROFIT_FEE_BUYBACK_SHARE), PROFIT_FEES);
  }

  // notional opened = margin (Filled.m) x leverage (FilledTerms.lev), both emitted in the fill tx
  const levByPos: Record<string, number> = {};
  for (const log of terms) levByPos[`${log.mkt}-${log.posId}`] = Number(log.lev);
  for (const log of fills) {
    const lev = levByPos[`${log.mkt}-${log.posId}`];
    if (!lev) throw new Error(`mog: missing FilledTerms for position ${log.mkt}-${log.posId}`);
    dailyVolume.addUSDValue(wad(log.m) * lev);
  }

  const dailyRevenue = dailyFees.clone();
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue };
};

const methodology = {
  Volume: "Notional opened on mog perpetual markets: margin times leverage of every filled order. Closes and liquidations are not counted.",
  Fees: "Flat 0.5 USDG open fee per resolved order plus a 5% fee on settled trader profits. Trader losses go to the treasury that backs payouts and are not counted as fees.",
  UserFees: "Open fees and profit fees paid by traders.",
  Revenue: "All fees accrue to the protocol; there are no liquidity providers.",
  HoldersRevenue: "70% of profit fees fund MOG buybacks and burns.",
  ProtocolRevenue: "Open fees plus 30% of profit fees fund protocol operations.",
};

const breakdownMethodology = {
  Fees: {
    [OPEN_FEES]: "Flat 0.5 USDG fee held per order and kept by the protocol once the order fills; refunded fees on cancelled or expired orders are excluded.",
    [PROFIT_FEES]: "5% of settled profit charged on winning positions at payout.",
  },
  UserFees: {
    [OPEN_FEES]: "Flat 0.5 USDG fee per filled order.",
    [PROFIT_FEES]: "5% of settled profit on winning positions.",
  },
  Revenue: {
    [OPEN_FEES]: "Open fees retained by the protocol.",
    [PROFIT_FEES]: "Profit fees retained by the protocol.",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "70% of profit fees allocated to MOG buybacks and burns.",
  },
  ProtocolRevenue: {
    [OPEN_FEES]: "Open fees funding protocol operations.",
    [PROFIT_FEES]: "30% of profit fees funding protocol operations.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-18",
  methodology,
  breakdownMethodology,
};

export default adapter;
