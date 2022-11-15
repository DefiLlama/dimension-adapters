import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    "ethpow": "https://subgraph.minerswap.fi/subgraphs/name/pancakeswap/exchange"
}, {
    factoriesName: 'pancakeFactories',
    dayData: 'pancakeDayData'
});
