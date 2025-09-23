import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BASE_AMM_URL =
  "https://api-dev.defituna.com/api/v1/integration/defillama/amm-revenues";

const getUrl = (startTime: number, endTime: number): string => {
  return `${BASE_AMM_URL}?from_timestamp=${startTime}&to_timestamp=${endTime}`;
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const url = getUrl(options.startTimestamp, options.endTimestamp);
  const response = await fetchURL(url);

  return {
    dailyVolume: response.volumeUsd || 0,
    dailyFees: response.feesUsd || 0,
    dailyUserFees: response.feesUsd || 0,
    dailyRevenue: response.revenuesUsd || 0,
    dailyProtocolRevenue: response.protocolRevenueUsd || 0,
    dailyHoldersRevenue: (response.revenuesUsd - response.protocolRevenueUsd) || 0,
    dailySupplySideRevenue: (response.feesUsd - response.revenuesUsd) || 0,
  };
};

const methodology = {
  Volume: "Total trading volume of the AMM",
  Fees: "Total amount of fees paid by users on AMM swaps",
  UserFees: "Same as Fees (explicitly denotes fees paid directly by end-users)",
  Revenue: "Portion of fees retained as AMM protocol revenue (commonly ~10%)",
  ProtocolRevenue: "Portion of AMM revenue allocated to the protocol treasury, based on its fixed share of 500M TUNA holdings",
  HoldersRevenue: "Portion of AMM revenue distributed to TUNA token holders, proportional to their share of the circulating TUNA supply (excluding the treasury’s 500M)",
  SupplySideRevenue: "Portion of AMM fees distributed to liquidity providers (LPs), usually ~90%",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-06-03",
  methodology,
};

export default adapter;
