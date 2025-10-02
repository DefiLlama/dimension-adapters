import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BASE_TUNA_URL =
  "https://api.defituna.com/api/v1/integration/defillama/tuna-revenues";

const getUrl = (startTime: number, endTime: number): string => {
  return `${BASE_TUNA_URL}?from_timestamp=${startTime}&to_timestamp=${endTime}`;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const url = getUrl(options.startTimestamp, options.endTimestamp);
  const response = await fetchURL(url);

  return {
    dailyFees: response.feesUsd || 0,
    dailyUserFees: response.feesUsd || 0,
    dailyRevenue: response.revenuesUsd || 0,
    dailyProtocolRevenue: response.protocolRevenueUsd || 0,
    dailyHoldersRevenue: (response.revenuesUsd - response.protocolRevenueUsd) || 0,
  };
};

const methodology = {
  Fees: "Total fees paid by users of DefiTuna Liquidity services",
  UserFees: "Same as Fees (explicitly denotes fees paid directly by end-users)",
  Revenue: "All fees collected by DefiTuna Liquidity are counted as revenue",
  ProtocolRevenue: "Share of revenue allocated to the protocol treasury, determined by its fixed 500M TUNA holdings",
  HoldersRevenue: "Share of revenue distributed to TUNA token holders, proportional to their share of the circulating TUNA supply (excluding the treasury’s 500M)",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-11-29",
  methodology,
};

export default adapter;
