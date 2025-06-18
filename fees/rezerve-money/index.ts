import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFees as getFeesFromShadow } from "./shadow";

const fetch = async (options: FetchOptions) => {
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const dailyFees = options.createBalances();

  const usdc_rzr_shadowlp = "0x08c5e3b7533ee819a4d1f66e839d0e8f04ae3d0c"; // Replace with your LP token address

  const fees = await getFeesFromShadow(fromBlock, toBlock, usdc_rzr_shadowlp);
  dailyFees.add(fees.token0.token, fees.token0.fees);
  dailyFees.add(fees.token1.token, fees.token1.fees);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Total fees accumulated by protocol-owned liquidity measured by k value growth",
  Revenue: "All fees go to protocol-owned liquidity",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: "2025-06-13",
      meta: {
        methodology,
      },
    },
  },
  version: 2,
};

export default adapter;
