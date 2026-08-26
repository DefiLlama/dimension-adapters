import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const API = "https://rebates.ophis.fi/defillama";
const START = "2026-05-14";

const chainIds: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.XDAI]: 100,
  [CHAIN.UNICHAIN]: 130,
  [CHAIN.POLYGON]: 137,
  [CHAIN.ROBINHOOD]: 4663,
  [CHAIN.BASE]: 8453,
  [CHAIN.PLASMA]: 9745,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.INK]: 57073,
  [CHAIN.LINEA]: 59144,
};

interface ChainDay {
  chainId: number;
  feesUsd: number;
  revenueUsd: number;
  supplySideRevenueUsd: number;
}

const fetch = async (options: FetchOptions) => {
  const response = await fetchURL(`${API}?date=${encodeURIComponent(options.dateString)}`);
  if (!response?.ok || !Array.isArray(response.chains)) {
    throw new Error(`ophis: incomplete reporting response for ${options.dateString}`);
  }
  const row = (response.chains as ChainDay[]).find((item) => item.chainId === chainIds[options.chain]);
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyFees.addUSDValue(row?.feesUsd ?? 0);
  dailyRevenue.addUSDValue(row?.revenueUsd ?? 0);
  dailySupplySideRevenue.addUSDValue(row?.supplySideRevenueUsd ?? 0);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
    Fees: "Ophis fees assessed on successfully settled Ophis-attributed fills, including the 1 bp base fee and capped price-improvement capture. Values come from Ophis' settlement-fill ledger, are bucketed by settlement date, and are valued in USD by the reporting indexer.",
  UserFees: "Total Ophis fees assessed on successfully settled fills.",
  Revenue: "Fees retained by Ophis. Ophis-operated chains retain the full fee; on CoW-hosted chains this is net of CoW Protocol's 25% partner-fee share.",
  ProtocolRevenue: "Revenue retained by Ophis after CoW Protocol's hosted-chain share.",
  SupplySideRevenue: "CoW Protocol's 25% share of Ophis fees on CoW-hosted chains; zero on Ophis-operated chains.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  start: START,
  chains: Object.keys(chainIds),
};

export default adapter;
