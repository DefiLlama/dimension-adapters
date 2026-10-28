import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

/**
 * lockin — social trading app on TON, Solana and BNB Chain.
 *
 * Website: https://lockin.cash/
 * Twitter: https://x.com/groypfi
 * Telegram mini app: https://t.me/tradeonlockinbot/app
 *
 * lockin charges a flat 1% (feeBps = 100) platform fee on every swap routed
 * through the app. The fee is taken in the swap's input asset and sent to the
 * lockin house fee wallets on each chain:
 *   TON  - UQDCfdwTj85G3ypmkz-G5Cy6YpfhhB-vO1dQTMJNwWTv4-5e
 *   SOL  - 3aVhBP1hvQuMRY7ciLBxDa36BTgadqW9aj1x3wDaN9Ws
 *   BSC  - 0xe1BA8be268f91c011040aC2b44EfC9201A52D988
 *
 * Nothing is shared with LPs, routers or token holders, so:
 *   dailyFees == dailyRevenue == dailyProtocolRevenue
 *
 * The API below aggregates swaps executed through lockin per chain over an
 * arbitrary [start, end] unix-second window and returns the USD notional plus
 * the 1% fee taken on it.
 */
const API = "https://npwofniytuzvjedgutgo.supabase.co/functions/v1/defillama";

// lockin internal chain slugs match DefiLlama's for these three chains.
const CHAIN_KEY: Record<string, string> = {
  [CHAIN.TON]: "ton",
  [CHAIN.SOLANA]: "solana",
  [CHAIN.BSC]: "bsc",
};

interface ChainStats {
  volume: number;
  fees: number;
}

interface ApiResponse {
  chains: Record<string, ChainStats>;
}

const fetch = async (options: FetchOptions) => {
  const key = CHAIN_KEY[options.chain];
  const url = `${API}?start=${options.startTimestamp}&end=${options.endTimestamp - 1}&chain=${key}`;
  const res: ApiResponse = await fetchURL(url);
  const stats = res.chains?.[key] ?? { volume: 0, fees: 0 };

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(stats.fees, METRIC.TRADING_FEES);

  return {
    dailyVolume: stats.volume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Volume: "Total USD notional of swaps executed by users through the lockin app.",
  Fees: "A flat 1% platform fee charged on every swap routed through lockin.",
  UserFees: "Users pay a 1% platform fee on each swap, on top of the underlying DEX/router fees.",
  Revenue: "All platform fees (1% of the swap's notional value) are kept by lockin — fees collected in the house fee wallets are revenue.",
  ProtocolRevenue: "100% of platform fees (1% of the swap's notional value) are sent to the lockin house fee wallets on TON, Solana and BNB Chain.",
  SupplySideRevenue: "No fees are shared with liquidity providers.",
  HoldersRevenue: "No fees are distributed to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "1% platform fee charged on every swap routed through lockin.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Users pay the 1% platform fee on each swap, on top of underlying DEX/router fees.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "All 1% platform fees are retained by lockin in the house fee wallets.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "100% of the 1% platform fees are sent to lockin's house fee wallets on TON, Solana and BNB Chain.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TON, CHAIN.SOLANA, CHAIN.BSC],
  start: "2026-08-18",
  methodology,
  breakdownMethodology,
};

export default adapter;
