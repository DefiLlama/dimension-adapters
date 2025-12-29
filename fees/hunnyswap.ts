import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const FACTORY = "0x0c6A0061F9D0afB30152b8761a273786e51bec6d";

// https://docs.hunnyswap.com/products/exchange/token-swap#trading-fees
const feesPercent = {
  Fees: 0.3,
  UserFees: 0.3,
  Revenue: 0.12, // gXOXO + LOVE + Treasury
  ProtocolRevenue: 0.02, // Treasury only
  HoldersRevenue: 0.1, // gXOXO + LOVE staking
  SupplySideRevenue: 0.18, // LP rewards
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: async (options: FetchOptions) => {
        const res = await getUniV2LogAdapter({
          factory: FACTORY,
        })(options);

        return {
          dailyVolume: res.dailyVolume,
          dailyFees: res.dailyVolume.clone(feesPercent.Fees / 100),
          dailyUserFees: res.dailyVolume.clone(feesPercent.UserFees / 100),
          dailyRevenue: res.dailyVolume.clone(feesPercent.Revenue / 100),
          dailyProtocolRevenue: res.dailyVolume.clone(
            feesPercent.ProtocolRevenue / 100,
          ),
          dailyHoldersRevenue: res.dailyVolume.clone(
            feesPercent.HoldersRevenue / 100,
          ),
          dailySupplySideRevenue: res.dailyVolume.clone(
            feesPercent.SupplySideRevenue / 100,
          ),
        };
      },
      start: "2022-06-06",
    },
  },
};

export default adapter;
