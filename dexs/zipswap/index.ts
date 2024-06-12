import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.OPTIMISM]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/5tAUjmnM9iE4aADZwKhk3fobY8fMFbb1VMsrSKvo4kFr`
}, {});
