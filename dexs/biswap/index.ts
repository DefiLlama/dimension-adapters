import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.BSC]: 'https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/2D9rXpMTvAgofWngsyRE17jKr5ywrU4W3Eaa71579qkd'
}, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});
