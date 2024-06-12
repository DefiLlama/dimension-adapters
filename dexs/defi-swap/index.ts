import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
    [CHAIN.ETHEREUM]: `https://gateway-arbitrum.network.thegraph.com/api/${process.env.GRAPH_PROTOCOL}/subgraphs/id/G7W3G1JGcFbWseucNkHHvQorxyjQLEQt7vt9yPN97hri`
}, {
    factoriesName: "factories",
    dayData: "dayData",
    dailyVolume: "dailyVolumeUSD",
    totalVolume: "totalVolumeUSD",
});
adapter.adapter.ethereum.start = 1632268798;

export default adapter;
