import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
    [CHAIN.WAN]: "https://thegraph.one/subgraphs/name/wanswap/wanswap-subgraph-3"
}, {
    factoriesName: "uniswapFactories",
    dayData: "uniswapDayData",
});
adapter.adapter.wan.start = 1632268798;

export default adapter;
