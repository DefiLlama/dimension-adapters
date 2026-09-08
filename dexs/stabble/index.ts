import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const volumeURL = "https://api.stabble.org/metric";

interface DailyStats {
  volume: number;
  fees: number;
  revenue: number;
}

const fetch = async (options: FetchOptions) => {

  const url = `${volumeURL}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
  const stats: DailyStats = await fetchURL(url);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // `fees` is the LP share only (70% of gross) and `revenue` is the treasury's 30%,
  // so gross swap fees are the sum of the two.
  dailyFees.addUSDValue(stats.fees + stats.revenue, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(stats.revenue, 'Token Swap Fees To $STB staking pool');
  dailySupplySideRevenue.addUSDValue(stats.fees, 'Token Swap Fees To LPs');

  return {
    dailyVolume: stats.volume,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Trading volume across stabble's stable and weighted AMM pools.",
  Fees: "Total swap fees paid by traders — the liquidity providers' share plus the protocol's cut.",
  Revenue: "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  HoldersRevenue: "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  SupplySideRevenue: "The 70% of swap fees kept by liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Gross swap fees charged on trades routed through stabble's stable and weighted AMM pools, before the LP/treasury split.",
  },
  Revenue: {
    'Token Swap Fees To $STB staking pool': "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  },
  HoldersRevenue: {
    'Token Swap Fees To $STB staking pool': "The 30% of swap fees sent to the stabble multisig treasury that funds the $STB staking pool.",
  },
  SupplySideRevenue: {
    'Token Swap Fees To LPs': "The 70% of swap fees kept by the liquidity providers of each pool.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-06-05',
  methodology,
  breakdownMethodology,
};

export default adapter;
