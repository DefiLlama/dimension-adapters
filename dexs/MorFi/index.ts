import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.MORPH]: "https://subgraph.morfi.io/subgraphs/name/morfi/core",
  },
  {
    factoriesName: "factories",
    dayData: "algebraDayData",
    dailyVolume: "volumeUSD",
    totalVolume: "totalVolumeUSD",
  }
);

adapters.adapter[CHAIN.MORPH].start = 1730177105;
export default adapters;
