import {univ2Adapter} from "../../helpers/getUniSubgraphVolume";
import {CHAIN} from "../../helpers/chains";

const endpoints = {
    [CHAIN.MAP]: "https://graph.mapprotocol.io/subgraphs/name/hiveswap/exchange-v3",
};

const adapter = univ2Adapter(
    endpoints,
    {
        factoriesName: "factories",
        dayData: "pancakeDayData",
        dailyVolume: "volumeUSD"
    });

adapter.adapter.map.start = 1706585489;

export default adapter
