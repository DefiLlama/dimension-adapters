import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";


async function fetch() {
  const { data } = await httpGet('https://app.meridian.money/api/liquidity-pools')
  const dailyVolume = data.reduce((acc: any, d: any) => acc + d.volume1d, 0);
  const dailyFees = data.reduce((acc: any, d: any) => acc + d.fees1d, 0);
  return { dailyFees, dailyVolume, dailyRevenue: dailyFees / 2, dailySupplySideRevenue: dailyFees / 2 };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.MOVE]: {
      fetch,
      runAtCurrTime: true,
    },
  },
  version: 2,
  methodology: {
    Fees: "Swap fees paid by users",
    Revenue: "The protocol keeps 50% of the swap fees",
    SupplySideRevenue: "50% of the swap fees go to LPs"
  }
};

export default adapter;
