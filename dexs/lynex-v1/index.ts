import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.LINEA]:
      "https://api.studio.thegraph.com/query/59052/lynex-v1/v0.0.4",
  },
  {
    factoriesName: "factories",
    dayData: "dayData",
    dailyVolume: "dailyVolumeUSD",
    totalVolume: "totalVolumeUSD",
  }
);

// New v1 factory contract created at block 2202427 = UNIX timestamp 1707620640
adapters.adapter.linea.start = 1707620640;
export default adapters;
