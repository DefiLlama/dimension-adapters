import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://vooi-rebates.fly.dev/defillama/volumes";

const fetchArbitrum = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}?ts=${options.startOfDay}`)
    let synfuturesItem = fetchData.filter(((item) => item.protocol == "synfutures"))
    let ostiumItem = fetchData.find(((item) => item.protocol == "ostium"))
    let gmxItem = fetchData.find(((item) => item.protocol == "gmx" && item.network == "arbitrum"))

    let dailyVolume = Number(ostiumItem?.dailyVolume || 0) + Number(gmxItem?.dailyVolume || 0)

    for (let i in synfuturesItem){
        dailyVolume = Number(dailyVolume) + Number(synfuturesItem[i].dailyVolume)
    }

    return {
        dailyVolume
    };
};

const fetchOptimism = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}?ts=${options.startOfDay}`)
    let orderlyItem = fetchData.find(((item) => item.protocol == "orderly"))

    return {
        dailyVolume: Number(orderlyItem?.dailyVolume || 0)
    };
};

const fetchHyperliquid = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}?ts=${options.startOfDay}`)
    let hyperliquidItem = fetchData.find(((item) => item.protocol == "hyperliquid"))
    return {
        dailyVolume: Number(hyperliquidItem?.dailyVolume || 0)
    };
};

const fetchBsc = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}?ts=${options.startOfDay}`)
    let kiloexItem = fetchData.filter(((item) => item.protocol == "kiloex" && item.network != "base"))
    return {
        dailyVolume: kiloexItem.reduce((acc, item) => acc + Number(item.dailyVolume), 0)
    };
};

const fetchBase = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const fetchData = await fetchURL(`${URL}?ts=${options.startOfDay}`)
    let kiloexItem = fetchData.filter(((item) => item.protocol == "kiloex" && item.network == "base"))[0]
    return {
        dailyVolume: Number(kiloexItem?.dailyVolume || 0)
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
            start: '2024-05-02'
        },
        [CHAIN.BSC]: {
            fetch: fetchBsc,
            start: '2024-06-01'
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
    doublecounted: true
}

export default adapter
