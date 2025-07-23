import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter2({
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('G7W3G1JGcFbWseucNkHHvQorxyjQLEQt7vt9yPN97hri')
}, {
    factoriesName: "factories",
    dayData: "dayData",
    dailyVolume: "dailyVolumeUSD",
    totalVolume: "totalVolumeUSD",
});
adapter.adapter.ethereum.start = 1632268798;

export default adapter;
