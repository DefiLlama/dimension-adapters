import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://vooi-rebates.fly.dev/";
const endpoint = "defillama/volumes";


const fetchArbitrum = async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}${endpoint}?ts=${options.startOfDay}`)
    let orderlyItem = fetchData.find(((item) => item.protocol == "orderly"))
    if (!orderlyItem) {
        orderlyItem = {dailyVolume: 0}
    }
    let synfuturesItem = fetchData.filter(((item) => item.protocol == "synfutures"))
    if (!synfuturesItem) {
        synfuturesItem = [{dailyVolume: 0}]
    }
    let kiloexItem = fetchData.filter(((item) => item.protocol == "kiloex"))
    if (!kiloexItem) {
        kiloexItem = [{dailyVolume: 0}]
    }
    let ostiumItem = fetchData.find(((item) => item.protocol == "ostium"))
    if (!ostiumItem) {
      ostiumItem = {dailyVolume: 0, totalVolume: 0}
    } 
    let dailyVolume = Number(orderlyItem.dailyVolume) + Number(ostiumItem.dailyVolume)
    let totalVolume = Number(orderlyItem.totalVolume) + Number(ostiumItem.totalVolume)

    for (let i in synfuturesItem){
        dailyVolume = Number(dailyVolume) + Number(synfuturesItem[i].dailyVolume)
    }
    for (let i in kiloexItem){
        dailyVolume = Number(dailyVolume) + Number(kiloexItem[i].dailyVolume)
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


const fetchOpBNB = async (timestamp: number): Promise<FetchResult> => {
    return {
        dailyVolume: 0,
        timestamp
    };
};

const fetchBlast = async (timestamp: number): Promise<FetchResult> => {
    return {
        dailyVolume: 0,
        timestamp
    };
};

const fetchBase = async (timestamp: number): Promise<FetchResult> => {
    return {
        dailyVolume: 0,
        timestamp
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetchArbitrum,
            start: '2024-05-02'
        },
        [CHAIN.OP_BNB]: {
            fetch: fetchOpBNB,
            start: '2024-06-01'
        },
        [CHAIN.BLAST]: {
            fetch: fetchBlast,
            start: '2024-07-01'
        },
        [CHAIN.BASE]: {
            fetch: fetchBase,
            start: '2024-08-01'
        },
        [CHAIN.HYPERLIQUID]: {
            fetch: fetchHyperliquid,
            start: '2024-11-04'
        }
    },
}
export default adapter
