import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2(
  {
    [CHAIN.LINEA]:
      "https://api.studio.thegraph.com/query/59052/lynex-v1/version/latest",
  },
  {
    factoriesName: "factories",
    totalVolume: "totalVolumeUSD",
    dailyVolume: "dailyVolumeUSD",
    dayData: "dayData",
  }
);

adapters.adapter.linea.start = "2024-02-11";
export default adapters;
