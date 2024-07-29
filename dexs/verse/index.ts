import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { ChainEndpoints, SimpleAdapter, BaseAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";

const endpoints: ChainEndpoints = {
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('CvSasxLYUvFbYyi7VXGhXL6PNgkZPoVDo2bo66ftEA2V'),
    [CHAIN.SMARTBCH]: "https://analytics-dex.api.bitcoin.com/subgraphs/name/verse/exchange",
};

const fetch = getChainVolume({
    graphUrls: endpoints,
    totalVolume: {
        factory: "factories",
        field: "volumeUSD",
    },
    dailyVolume: {
        factory: "dayData",
        field: "volumeUSD",
    },
});

const volumeAdapter: BaseAdapter = {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: 1655164800,
    },
    [CHAIN.SMARTBCH]: {
        fetch: fetch(CHAIN.SMARTBCH),
        start: 1646697600,
    },
}

const adapter: SimpleAdapter = {
    adapter: volumeAdapter,
}

export default adapter;
