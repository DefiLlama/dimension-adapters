import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.BLAST]:
      "https://graph-node.bladeswap.xyz/subgraphs/name/bladeswap/algebra-mainnet-info",
  },
  {
    factoriesName: "factories",
    dayData: "algebraDayData",
    dailyVolume: "volumeUSD",
    totalVolume: "totalVolumeUSD",
  }
);

adapters.adapter.blast.start = 1717740000;
export default adapters;
