import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const chainConfig: Record<string, string> = {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('8knsFRJjoEtsRECVSdxhfbvidipCMdBjXx1hQmMRujHx'),
}

const fetch = univ2Adapter2({
    endpoints: chainConfig,
    factoriesName: 'factories',
    totalVolume: 'totalVolumeUSD',
    totalFeesField: 'totalFeesUSD',
})

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: Object.keys(chainConfig),
    start: '2025-11-22'
}

export default adapter;
