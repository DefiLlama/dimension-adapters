import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.BLAST]:
      "https://api.studio.thegraph.com/query/67572/mainnet-algebra-fenix/version/latest",
  },
  {
    factoriesName: "factories",
    dayData: "algebraDayData",
    dailyVolume: "volumeUSD",
    totalVolume: "totalVolumeUSD",
  }
);

adapters.adapter.blast.start = 1714590000;
export default adapters;
