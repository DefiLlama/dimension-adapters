import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/chopachom/nomiswap-subgraph-exchange",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "nomiswapFactories",
  dayData: "nomiswapDayData",
  dailyVolume: "dailyVolumeUSD",
  totalVolume: "totalVolumeUSD"
});

adapter.adapter.bsc.start = async () => 1634710338

export default adapter
