import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://vooi-rebates.fly.dev/";
const endpoint = "defillama/volumes";
const startTimestampArbitrum = 1714608000; // 02.05.2024
const startTimestampBlast = 1719792000; // 01.07.2024
const startTimestampOpBNB = 1717200000; // 01.06.2024
const startTimestampBase = 1722470400; // 01.08.2024

const fetchArbitrum = async (options: FetchOptions): Promise<FetchResult> => {
    const timestamp = options.toTimestamp
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${timestamp}`)
    const orderlyItem = fetchData.find(((item) => item.protocol == "orderly"))
    if (!orderlyItem) return {dailyVolume: 0, totalVolume: 0, timestamp}
    const dailyVolume = orderlyItem.dailyVolume
    const totalVolume = orderlyItem.totalVolume
    return {
        dailyVolume,
        totalVolume,
        timestamp
    };
};

const fetchBlast = async (options: FetchOptions): Promise<FetchResult> => {
    const timestamp = options.toTimestamp
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${timestamp}`)
    const synfuturesItem = fetchData.find(((item) => item.protocol == "synfutures" && item.network == "blast"))
    if (!synfuturesItem) return {dailyVolume: 0, totalVolume: 0, timestamp}
    const dailyVolume = synfuturesItem.dailyVolume
    const totalVolume = synfuturesItem.totalVolume
    return {
        dailyVolume,
        totalVolume,
        timestamp
    };
};

const fetchBase = async (options: FetchOptions): Promise<FetchResult> => {
    const timestamp = options.toTimestamp
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${timestamp}`)
    const synfuturesItem = fetchData.find(((item) => item.protocol == "synfutures" && item.network == "base"))
    if (!synfuturesItem) return {dailyVolume: 0, totalVolume: 0, timestamp}
    const dailyVolume = synfuturesItem.dailyVolume
    const totalVolume = synfuturesItem.totalVolume
    return {
        dailyVolume,
        totalVolume,
        timestamp
    };
};

const fetchOpBNB = async (options: any): Promise<FetchResult> => {
    const timestamp = options.toTimestamp
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${timestamp}`)
    const kiloexItem = fetchData.find(((item) => item.protocol == "kiloex"))
    if (!kiloexItem) return {dailyVolume: 0, totalVolume: 0, timestamp}
    const dailyVolume = kiloexItem.dailyVolume
    const totalVolume = kiloexItem.totalVolume
    return {
        dailyVolume,
        totalVolume,
        timestamp
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetchArbitrum,
            start: startTimestampArbitrum
        },
        [CHAIN.BLAST]: {
            fetch: fetchBlast,
            start: startTimestampBlast
        },
        [CHAIN.OP_BNB]: {
            fetch: fetchOpBNB,
            start: startTimestampOpBNB
        },
        [CHAIN.BASE]: {
            fetch: fetchBase,
            start: startTimestampBase
        },
    },
    version: 2
}
export default adapter