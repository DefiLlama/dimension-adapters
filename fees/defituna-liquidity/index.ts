import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BASE_TUNA_URL = "https://api.defituna.com/api/v1/integration/defillama/tuna-revenues";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const url = `${BASE_TUNA_URL}?from_timestamp=${options.startTimestamp}&to_timestamp=${options.endTimestamp}`;
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
  Fees: "Liquidity services fees(borrowing/limit order execution fee/collateral fee and liquidation fees)",
  UserFees: "Liquidity services fees(borrowing/limit order execution fee/collateral fee and liquidation fees)",
  Revenue: "Share of revenue allocated to treasury and shared with token stakers",
  ProtocolRevenue: "Share of revenue allocated to the protocol treasury",
  HoldersRevenue: "Share of revenue distributed to TUNA token holders, proportional to their share of the circulating TUNA supply (excluding the treasury's 500M)",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-11-29",
  methodology,
};

export default adapter;
