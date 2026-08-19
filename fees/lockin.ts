import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const LOCKIN_STATS_API = "https://npwofniytuzvjedgutgo.supabase.co/functions/v1/defillama";

interface LockinStatsResponse {
  protocol: string;
  feeBps: number;
  start: number;
  end: number;
  chains: Record<string, { volume: number; fees: number }>;
  totalVolume: number;
  totalFees: number;
}

const LABELS = {
  PLATFORM_FEE: "Lockin Platform Fee",
  TREASURY: "Lockin Treasury",
} as const;

const methodology = {
  Volume: "Total USD notional of swaps executed by users through the lockin app.",
  Fees: "A flat 1% platform fee charged on every swap routed through lockin.",
  UserFees: "Users pay a 1% platform fee on each swap, on top of the underlying DEX/router fees.",
  Revenue: "All platform fees are kept by lockin — fees collected in the house fee wallets are revenue.",
  ProtocolRevenue: "100% of platform fees are sent to the lockin house fee wallets on TON, Solana and BNB Chain.",
  SupplySideRevenue: "No fees are shared with liquidity providers.",
  HoldersRevenue: "No fees are distributed to token holders.",
};

const breakdownMethodology = {
  [LABELS.PLATFORM_FEE]: "A flat 1% fee charged on the USD notional of every swap executed through the lockin app.",
  [LABELS.TREASURY]: "All platform fees are retained by the protocol in the lockin house fee wallets across TON, Solana and BNB Chain.",
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const start = options.startOfDay;
  const end = start + 86_400;

  const url = ${LOCKIN_STATS_API}?start=${start}&end=${end};
  const stats: LockinStatsResponse = await fetchURL(url);

  const dailyVolume = stats.totalVolume;
  const dailyFees = stats.totalFees;
  const dailyUserFees = dailyFees;
  const dailyRevenue = dailyFees;
  const dailyProtocolRevenue = dailyFees;
  const dailySupplySideRevenue = 0;
  const dailyHoldersRevenue = 0;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyFeesBreakdown: { [LABELS.PLATFORM_FEE]: dailyFees },
    dailyRevenueBreakdown: { [LABELS.TREASURY]: dailyRevenue },
    dailyProtocolRevenueBreakdown: { [LABELS.TREASURY]: dailyProtocolRevenue },
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON, CHAIN.SOLANA, CHAIN.BSC],
  start: "2026-08-18",
  methodology,
  breakdownMethodology,
};

export default adapter;
