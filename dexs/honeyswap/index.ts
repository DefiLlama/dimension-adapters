import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: " https://api.thegraph.com/subgraphs/name/1hive/honeyswap-polygon",
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/1hive/honeyswap-xdai"
}, {
    factoriesName: "honeyswapFactories",
    dayData: "honeyswapDayData",
});
adapters.adapter.polygon.start = 1622173831;
adapters.adapter.xdai.start = 1599191431;

export default adapters;
