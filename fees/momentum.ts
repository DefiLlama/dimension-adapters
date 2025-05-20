import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";


async function fetch() {
  const { data } = await httpGet('https://api.mmt.finance/pools/v3')
  const dailyVolume = data.reduce((acc: any, d: any) => acc + +d.volume24h, 0);
  const dailyFees = data.reduce((acc: any, d: any) => acc + +d.fees24h, 0);
  return { dailyFees, dailyVolume, };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      runAtCurrTime: true,
    },
  },
  version: 2
};

export default adapter;
