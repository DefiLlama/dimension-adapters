import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2(
  {
    [CHAIN.ZIRCUIT]:
      "https://api.goldsky.com/api/public/project_cltyhthusbmxp01s95k9l8a1u/subgraphs/ocelex-cl/1.0.0/gn",
  },
  {
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
  }
);

adapters.adapter.zircuit.start = 1708748365; // Oct-24-2024 04:32:45 AM
export default adapters;
