import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.MANTLE]: "https://subgraph-api.mantle.xyz/api/public/f077c8d4-0d6c-42d4-9bbd-050948dc5c86/subgraphs/swapsicle/analytics/prod/gn",
  [CHAIN.TELOS]: "https://test.telos.subgraph.swapsicle.io/subgraphs/name/swapsicle/analytics",
  [CHAIN.TAIKO]: "https://api.goldsky.com/api/public/project_clr6mlufzbtuy01vd012wgt5k/subgraphs/swapsicle-analytics-taiko/prod/gn"
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter[CHAIN.MANTLE].start = 1697155200;
adapters.adapter[CHAIN.TELOS].start = 1698105600;
adapters.adapter[CHAIN.TAIKO].start = 1724943360;
export default adapters;
