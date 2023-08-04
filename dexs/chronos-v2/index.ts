import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ARBITRUM]: "https://subgraph.chronos.exchange/subgraphs/name/chronos-v3",
}, {
  factoriesName: "factories",
  dayData: "uniswapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "volumeUSD",
});

// adapters.adapter.polygon.start = async () => 1654992851;
export default adapters;
