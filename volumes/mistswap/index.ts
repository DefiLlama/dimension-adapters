import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.SMARTBCH]: "https://thegraph.mistswap.fi/subgraphs/name/mistswap/exchange"
}, {
  factoriesName: "factories",
  totalVolume: "volumeUSD",
  dayData: "dayData",
  dailyVolume: "volumeUSD",
  dailyVolumeTimestampField: "date"
});

adapters.adapter.smartbch.start = async () => 1633220803;
export default adapters;
