import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { Adapter, FetchOptions } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

const fetch = async (options: FetchOptions) => {
  const baseResult = await getUniV2LogAdapter({
    factory: "0x858e3312ed3a876947ea49d572a7c42de08af7ee",
    fees: 0.002
  })(options);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Add fees with labels: 0.20% total swap fees
  dailyFees.addBalances(baseResult.dailyFees, METRIC.SWAP_FEES);

  // 100% of fees go to LPs
  dailySupplySideRevenue.addBalances(baseResult.dailyFees, METRIC.LP_FEES);

  return {
    dailyVolume: baseResult.dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
  };
};

const methodology = {
  UserFees: "Users pay 0.20% of each swap",
  Fees: "A 0.20% trading fee is collected on all swaps",
  SupplySideRevenue: "LPs receive 100% of trading fees (0.20% of swap volume)"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading fees paid by users on each swap, fixed at 0.20% of trade volume"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "All swap fees are distributed to liquidity providers (0.20% of volume)"
  }
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.BSC],
  fetch,
  start: '2021-05-24',
  methodology,
  breakdownMethodology,
};

export default adapter;
