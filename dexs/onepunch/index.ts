import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.BSC]:
      "https://api.thegraph.com/subgraphs/name/one-punch-team/onepunch-subgraph-bsc",
  },
  {
    factoriesName: "onePunchDatas",
    dayData: "onePunchDayData",
    dailyVolume: "dailyVolumnUSD",
    totalVolume: "totalVolumeUSD",
    hasTotalVolume: true,
  }
);
adapters.adapter.bsc.start = 1671580800;

export default adapters;
