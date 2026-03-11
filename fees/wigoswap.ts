import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const feesPercent: Record<string, number> = {
  Fees: 0.19,
  UserFees: 0.19,
  Revenue: 0.01,
  ProtocolRevenue: 0,
  HoldersRevenue: 0.01,
  SupplySideRevenue: 0.18,
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch:  async (options: FetchOptions) => {
        const res = await getUniV2LogAdapter({
          factory: "0xc831a5cbfb4ac2da5ed5b194385dfd9bf5bfcba7",
        })(options)
        const dailyFees = res.dailyVolume.clone(feesPercent.Fees/100);
        const dailyRevenue = res.dailyVolume.clone(feesPercent.Revenue/100);
        const dailyProtocolRevenue = res.dailyVolume.clone(feesPercent.ProtocolRevenue/100);
        const dailyHoldersRevenue = res.dailyVolume.clone(feesPercent.HoldersRevenue/100);
        const dailySupplySideRevenue = res.dailyVolume.clone(feesPercent.SupplySideRevenue/100);
        return {
          dailyFees,
          dailyRevenue,
          dailyProtocolRevenue,
          dailyHoldersRevenue,
          dailySupplySideRevenue,
        }
      },
      start: '2022-01-24',
    },
  },
};

export default adapter;
  