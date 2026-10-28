import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BASE_TUNA_URL = "https://api.defituna.com/api/v1/integration/defillama/tuna-revenues";

const LABEL = 'Liquidity Services Fees';

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const url = `${BASE_TUNA_URL}?from_timestamp=${options.startTimestamp}&to_timestamp=${options.endTimestamp}`;
  const response = await fetchURL(url);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(response.feesUsd || 0, LABEL);
  dailyRevenue.addUSDValue(response.revenuesUsd || 0, LABEL);
  dailyProtocolRevenue.addUSDValue(response.protocolRevenueUsd || 0, LABEL);
  dailyHoldersRevenue.addUSDValue((response.revenuesUsd - response.protocolRevenueUsd) || 0, LABEL);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Liquidity services fees(borrowing/limit order execution fee/collateral fee and liquidation fees)",
  UserFees: "Liquidity services fees(borrowing/limit order execution fee/collateral fee and liquidation fees)",
  Revenue: "Share of revenue allocated to treasury and shared with token stakers",
  ProtocolRevenue: "Share of revenue allocated to the protocol treasury",
  HoldersRevenue: "Share of revenue distributed to TUNA token holders, proportional to their share of the circulating TUNA supply (excluding the treasury's 500M)",
};

const breakdownMethodology = {
  Fees: { [LABEL]: methodology.Fees },
  UserFees: { [LABEL]: methodology.UserFees },
  Revenue: { [LABEL]: methodology.Revenue },
  ProtocolRevenue: { [LABEL]: methodology.ProtocolRevenue },
  HoldersRevenue: { [LABEL]: methodology.HoldersRevenue },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2024-11-29",
  methodology,
  breakdownMethodology,
};

export default adapter;
