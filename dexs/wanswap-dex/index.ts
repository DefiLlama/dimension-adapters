import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
    endpoints: {
        [CHAIN.WAN]: "https://thegraph.one/subgraphs/name/wanswap/wanswap-subgraph-3"
    },
    factoriesName: "uniswapFactories",
    dayData: "uniswapDayData",
});

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.WAN],
    start: 1632268798,
}

export default adapter;
