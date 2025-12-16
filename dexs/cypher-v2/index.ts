import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";
import { getEnv } from "../../helpers/env";

const chainConfig: Record<string, string> = {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('BTCmD66QoqG2f3pirgYmKWgc2LWgw4F4bEavsupxkS2h'),
}

const fetch = univ2Adapter2({
    endpoints: chainConfig,
    factoriesName: 'uniswapFactories',
    totalVolume: 'totalVolumeUSD',
    totalFeesField: 'totalFeeUSD',
})

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: Object.keys(chainConfig),
    start: '2025-11-22'
}

export default adapter;
