import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/4540/wagmi-zksync-era/v0.05",
  [CHAIN.KAVA]: "https://kava.graph.wagmi.com/subgraphs/name/v3"
}, {
  factoriesName: "factories",
  dayData: "uniswapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.era.start = async () => 1681257600;
adapters.adapter.kava.start = async () => 1694476800;
export default adapters;
