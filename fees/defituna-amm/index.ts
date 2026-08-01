import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const BASE_AMM_URL = "https://api.defituna.com/api/v1/integration/defillama/amm-revenues";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const url = `${BASE_AMM_URL}?from_timestamp=${options.startTimestamp}&to_timestamp=${options.endTimestamp}`;
  const { feesUsd, revenuesUsd, protocolRevenueUsd, volumeUsd } = await fetchURL(url);

  dailyFees.addUSDValue(feesUsd, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(revenuesUsd, METRIC.SWAP_FEES);
  dailyProtocolRevenue.addUSDValue(protocolRevenueUsd, METRIC.SWAP_FEES);
  dailyHoldersRevenue.addUSDValue(revenuesUsd - protocolRevenueUsd, METRIC.SWAP_FEES);
  dailySupplySideRevenue.addUSDValue(feesUsd - revenuesUsd, METRIC.LP_FEES);

  return {
    dailyVolume: volumeUsd || 0,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Swap fees paid by users from all trades.',
    [METRIC.LP_FEES]: 'Fees paid to liquidity providers.',
  }
}

const methodology = {
  Fees: "swap fees paid by users",
  UserFees: "swap fees paid by users",
  Revenue: "Share of revenue allocated to the protocol treasury",
  ProtocolRevenue: "Share of revenue allocated to the protocol treasury",
  HoldersRevenue: "Share of revenue distributed to TUNA token holders, proportional to their share of the circulating TUNA supply (excluding the treasury's 500M)",
  SupplySideRevenue: "Portion of AMM fees distributed to liquidity providers (LPs)",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-06-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
