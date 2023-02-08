import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/thenaursa/thena-v1"
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
  dayData: "dayData",
  dailyVolume: "dailyVolumeUSD",
  dailyVolumeTimestampField: "date"
});

adapters.adapter.bsc.start = async () => 1672790400;
export default adapters;
