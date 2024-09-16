import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ERA]:
    "https://api.studio.thegraph.com/query/30365/syncswap-graph/1.4.0",
};

const adapter = univ2Adapter2(endpoints, {
  factoriesName: "syncSwapFactories",
  totalVolume: "totalVolumeUSD",
});

adapter.adapter.era.start = 1679529600;

export default adapter;
