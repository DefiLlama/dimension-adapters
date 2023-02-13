import { CHAIN } from "../../helpers/chains";
import { ChainEndpoints, SimpleAdapter, BaseAdapter } from "../../adapters/types";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";

const endpoints: ChainEndpoints = {
    [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/arnkthr/ethv1",
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
        start: async () => 1655164800,
    },
    [CHAIN.SMARTBCH]: {
        fetch: fetch(CHAIN.SMARTBCH),
        start: async () => 1646697600,
    },
}

const adapter: SimpleAdapter = {
    adapter: volumeAdapter,
}

export default adapter;
