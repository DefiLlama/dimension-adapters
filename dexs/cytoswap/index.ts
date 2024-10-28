import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.HELA]: "https://subgraph.snapresearch.xyz/subgraphs/name/cytoswap-mainnet",
}, {
  factoriesName: "factories",
  dayData: "uniswapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter[CHAIN.HELA].start = 1715299200;
export default adapters;
