import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { ChainEndpoints, SimpleAdapter, BaseAdapter } from "../../adapters/types";
import { getChainVolume, univ2Adapter } from "../../helpers/getUniSubgraphVolume";

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
        customBackfill: customBackfill(CHAIN.ETHEREUM, fetch),
    },
    [CHAIN.SMARTBCH]: {
        fetch: fetch(CHAIN.SMARTBCH),
        start: async () => 1646697600,
        customBackfill: customBackfill(CHAIN.SMARTBCH, fetch),
    },
}

const adapter: SimpleAdapter = {
    adapter: volumeAdapter,
}

export default adapter;