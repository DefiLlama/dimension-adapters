import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.LINEA]:
      "https://api.studio.thegraph.com/query/59052/lynex-v1/v0.0.4",
  },
  {
    factoriesName: "factories",
    dayData: "DayData",
    dailyVolume: "dailyVolumeUSD",
    totalVolume: "totalVolumeUSD",
  }
);

adapters.adapter.linea.start = 2517108;
export default adapters;
