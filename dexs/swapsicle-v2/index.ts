import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.MANTLE]: "https://subgraph-api.mantle.xyz/subgraphs/name/cryptoalgebra/analytics",
  [CHAIN.TELOS]: "https://telos.subgraph.swapsicle.io/subgraphs/name/cryptoalgebra/analytics"
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter[CHAIN.MANTLE].start = 1697155200;
adapters.adapter[CHAIN.TELOS].start = 1698105600;
export default adapters;
