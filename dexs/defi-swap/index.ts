import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
    [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/crypto-com/swap-subgraph"
}, {
    factoriesName: "factories",
    dayData: "dayData",
    dailyVolume: "dailyVolumeUSD",
    totalVolume: "totalVolumeUSD",
});
adapter.adapter.ethereum.start = 1632268798;

export default adapter;
