import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

// https://iloveics.gitbook.io/icpswap/ics/how-much-are-icpswap-fees
// Fee breakdown: 0.3% total swap fee
// 0.06% → ICS token buybacks/burns (protocol revenue)
// 0.24% → liquidity providers (supply-side revenue)
const TOTAL_FEE = 0.003;
const PROTOCOL_FEE = 0.0006;
const LP_FEE = 0.0024;

const fetch = async (options: FetchOptions) => {
  const { volumeUSD } = await fetchURL('https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/overview');

  const dailyVolume = volumeUSD;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(dailyVolume * TOTAL_FEE, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(dailyVolume * PROTOCOL_FEE, "Token Swap Fees to Buyback and Burn");
  dailySupplySideRevenue.addUSDValue(dailyVolume * LP_FEE, "Token Swap Fees to LPs");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Trading volume across all ICPSwap pools.",
  Fees: "0.3% fee charged on every swap.",
  Revenue: "0.06% of each swap allocated to ICS token buybacks and burns.",
  HoldersRevenue: "0.06% of each swap allocated to ICS token buybacks and burns.",
  SupplySideRevenue: "0.24% of each swap distributed to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "0.3% fee charged on every swap.",
  },
  Revenue: {
    "Token Swap Fees to Buyback and Burn": "0.06% of each swap allocated to ICS token buybacks and burns.",
  },
  HoldersRevenue: {
    "Token Swap Fees to Buyback and Burn": "0.06% of each swap allocated to ICS token buybacks and burns.",
  },
  SupplySideRevenue: {
    "Token Swap Fees to LPs": "0.24% of each swap distributed to liquidity providers.",
  },
}

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ICP],
  start: '2023-07-16',
  runAtCurrTime: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
