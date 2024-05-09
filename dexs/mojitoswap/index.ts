import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.KCC]: "https://thegraph.kcc.network/subgraphs/name/mojito/swap",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "uniswapFactories",
  dayData: "uniswapDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD"
});

adapter.adapter.kcc.start = 1634200191;

export default adapter
