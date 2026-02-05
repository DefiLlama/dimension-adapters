import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
    endpoints: {
        "ethpow": "https://subgraph.minerswap.fi/subgraphs/name/pancakeswap/exchange"
    },
    factoriesName: 'pancakeFactories',
    dayData: 'pancakeDayData'
});

const adapter: SimpleAdapter = {
  chains: [CHAIN.ETHEREUM],
  fetch,
}

export default adapter;