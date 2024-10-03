import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://vooi-rebates.fly.dev/";
const endpoint = "defillama/volumes";
const startTimestampArbitrum = 1714608000; // 02.05.2024
const startTimestampBlast = 1719792000; // 01.07.2024
const startTimestampOpBNB = 1717200000; // 01.06.2024
const startTimestampBase = 1722470400; // 01.08.2024

const fetchArbitrum = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
    // const timestamp = options.toTimestamp
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${options.startOfDay}`) // returns data for the day before
    let orderlyItem = fetchData.find(((item) => item.protocol == "orderly"))
    if (!orderlyItem) {
        orderlyItem = {dailyVolume: 0, totalVolume: 0}
    }
    let synfuturesItem = fetchData.filter(((item) => item.protocol == "synfutures"))
    if (!synfuturesItem) {
        synfuturesItem = {dailyVolume: 0, totalVolume: 0}
    }
    let kiloexItem = fetchData.filter(((item) => item.protocol == "kiloex"))
    if (!kiloexItem) {
        kiloexItem = {dailyVolume: 0, totalVolume: 0}
    }
    let dailyVolume = Number(orderlyItem.dailyVolume)
    let totalVolume = Number(orderlyItem.totalVolume)
    for (let i in synfuturesItem){
        dailyVolume = Number(dailyVolume) + Number(synfuturesItem[i].dailyVolume)
        totalVolume = Number(totalVolume) + Number(synfuturesItem[i].totalVolume)
    }
    for (let i in kiloexItem){
        dailyVolume = Number(dailyVolume) + Number(kiloexItem[i].dailyVolume)
        totalVolume = Number(totalVolume) + Number(kiloexItem[i].totalVolume)
    }
    return {
        dailyVolume,
        totalVolume,
        timestamp
    };
};


const fetchOpBNB = async (timestamp: number): Promise<FetchResult> => {
    return {
        dailyVolume: 0,
        totalVolume: 0,
        timestamp
    };
};

const fetchBlast = async (timestamp: number): Promise<FetchResult> => {
    return {
        dailyVolume: 0,
        totalVolume: 0,
        timestamp
    };
};

const fetchBase = async (timestamp: number): Promise<FetchResult> => {
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
