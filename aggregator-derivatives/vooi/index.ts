import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://vooi-rebates.fly.dev/";
const endpoint = "defillama/volumes";
const startTimestampArbitrum = 1714608000; // 02.05.2024
const startTimestampBsc = 1717200000; // 01.06.2024
const startTimestampBase = 1722470400; // 01.08.2024
const startTimestampHyperliquid = 1730678400; // 04.11.2024

const fetchArbitrum = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
    // const timestamp = options.toTimestamp
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${options.startOfDay}`) // returns data for the day before
    let synfuturesItem = fetchData.filter(((item) => item.protocol == "synfutures"))
    if (!synfuturesItem) {
        synfuturesItem = [{dailyVolume: 0, totalVolume: 0}]
    }
    let ostiumItem = fetchData.find(((item) => item.protocol == "ostium"))
    if (!ostiumItem) {
        ostiumItem = {dailyVolume: 0, totalVolume: 0}
    }

    let gmxItem = fetchData.find(((item) => item.protocol == "gmx" && item.network == "arbitrum"))
    if (!gmxItem) {
        gmxItem = {dailyVolume: 0, totalVolume: 0}
    }

    let dailyVolume =
        + Number(ostiumItem.dailyVolume)
        + Number(gmxItem.dailyVolume)
    let totalVolume =
        + Number(ostiumItem.totalVolume)
        + Number(gmxItem.totalVolume)

    for (let i in synfuturesItem){
        dailyVolume = Number(dailyVolume) + Number(synfuturesItem[i].dailyVolume)
    }
    return {
        dailyVolume,
        timestamp
    };
};

const fetchHyperliquid = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
    return {
        dailyVolume: 0,
        timestamp
    };
};

const fetchOptimism = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${options.startOfDay}`) // returns data for the day before

    let orderlyItem = fetchData.find(((item) => item.protocol == "orderly"))
    if (!orderlyItem) {
        orderlyItem = {dailyVolume: 0, totalVolume: 0}
    }
    let dailyVolume = Number(orderlyItem.dailyVolume)
    let totalVolume = Number(orderlyItem.totalVolume)
    return {
        dailyVolume: dailyVolume,
        totalVolume: totalVolume,
        timestamp
    };
};

const fetchHyperliquid = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${options.startOfDay}`) // returns data for the day before

    let hyperliquidItem = fetchData.find(((item) => item.protocol == "hyperliquid"))
    if (!hyperliquidItem) {
        hyperliquidItem = {dailyVolume: 0, totalVolume: 0}
    }
    let dailyVolume = Number(hyperliquidItem.dailyVolume)
    let totalVolume = Number(hyperliquidItem.totalVolume)
    return {
        dailyVolume: dailyVolume,
        totalVolume: totalVolume,
        timestamp
    };
};


const fetchBsc = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${options.startOfDay}`) // returns data for the day before
    let kiloexItem = fetchData.filter(((item) => item.protocol == "kiloex" && item.network != "base"))
    if (!kiloexItem) {
        kiloexItem = [{dailyVolume: 0, totalVolume: 0}]
    }
    let dailyVolume = 0
    let totalVolume = 0

    for (let i in kiloexItem){
        dailyVolume = Number(dailyVolume) + Number(kiloexItem[i].dailyVolume)
        totalVolume = Number(totalVolume) + Number(kiloexItem[i].totalVolume)
    }
    return {
        dailyVolume: dailyVolume,
        totalVolume: totalVolume,
        timestamp
    };
};

const fetchBase = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${options.startOfDay}`) // returns data for the day before
    let kiloexItem = fetchData.filter(((item) => item.protocol == "kiloex" && item.network == "base"))[0]
    if (!kiloexItem) {
        kiloexItem = {dailyVolume: 0, totalVolume: 0}
    }
    let dailyVolume = Number(kiloexItem.dailyVolume)
    let totalVolume = Number(kiloexItem.totalVolume)
    return {
        dailyVolume: dailyVolume,
        totalVolume: totalVolume,
        timestamp
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetchArbitrum,
            start: '2024-05-02'
        },
        [CHAIN.OPTIMISM]: {
            fetch: fetchOptimism,
            start: startTimestampArbitrum
        },
        [CHAIN.BSC]: {
            fetch: fetchBsc,
            start: startTimestampBsc
        },
        [CHAIN.BASE]: {
            fetch: fetchBase,
            start: '2024-08-01'
        },
        [CHAIN.HYPERLIQUID]: {
            fetch: fetchHyperliquid,
            start: startTimestampHyperliquid
        }
    },
}
export default adapter
