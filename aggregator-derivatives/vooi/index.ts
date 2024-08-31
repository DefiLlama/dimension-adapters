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
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${timestamp}`) // returns data for the day before
    let orderlyItem = fetchData.find(((item) => item.protocol == "orderly"))
    if (!orderlyItem) {
        orderlyItem = {dailyVolume: 0, totalVolume: 0}
    }
    let synfuturesItem = fetchData.filter(((item) => item.protocol == "synfutures"))
    if (!synfuturesItem) {
        synfuturesItem = {dailyVolume: 0, totalVolume: 0}
    }
    let kiloexItem = fetchData.find(((item) => item.protocol == "kiloex"))
    if (!kiloexItem) {
        kiloexItem = {dailyVolume: 0, totalVolume: 0}
    }
    let dailyVolume = Number(orderlyItem.dailyVolume) + Number(kiloexItem.dailyVolume)
    let totalVolume = Number(orderlyItem.totalVolume) + Number(kiloexItem.totalVolume)
    for (let i in synfuturesItem){
        dailyVolume = Number(dailyVolume) + Number(synfuturesItem[i].dailyVolume)
        totalVolume = Number(totalVolume) + Number(synfuturesItem[i].totalVolume)
    }
    return {
        dailyVolume,
        totalVolume,
        timestamp
    };
};


const fetchOpBNB = async (options: any): Promise<FetchResult> => {
    const timestamp = options.toTimestamp
    return {
        dailyVolume: 0,
        totalVolume: 0,
        timestamp
    };
};

const fetchBlast = async (options: any): Promise<FetchResult> => {
    const timestamp = options.toTimestamp
    return {
        dailyVolume: 0,
        totalVolume: 0,
        timestamp
    };
};

const fetchBase = async (options: any): Promise<FetchResult> => {
    const timestamp = options.toTimestamp
    return {
        dailyVolume: 0,
        totalVolume: 0,
        timestamp
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetchArbitrum,
            start: startTimestampArbitrum
        },
        [CHAIN.OP_BNB]: {
            fetch: fetchOpBNB,
            start: startTimestampOpBNB
        },
        [CHAIN.BLAST]: {
            fetch: fetchBlast,
            start: startTimestampBlast
        },
        [CHAIN.BASE]: {
            fetch: fetchBase,
            start: startTimestampBase
        },
    },
}
export default adapter
