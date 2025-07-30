import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const config = {
    [CHAIN.ARBITRUM]: 'https://min-api.bitoro.network/btr/stats/global',
    [CHAIN.INJECTIVE]: 'https://min-api.inj.bitoro.network/stats/global'
}

const getUrl = (chain: string, startTime: number, endTime: number): string => {
    return `${config[chain]}?start=${startTime}&end=${endTime}`;
}

const fetch = async (_:any, _b:any ,options: any): Promise<FetchResult> => {
    const { endTimestamp, startTimestamp } = options;
    const dailyVolume = await fetchURL(getUrl(options.chain, startTimestamp, endTimestamp));

    return {
        dailyVolume: dailyVolume.volume || 0,
    };
};

const adapter: SimpleAdapter = {
    // webapp, X account were down,
    deadFrom: '2025-07-18',
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-03-24'
        },
        [CHAIN.INJECTIVE]: {
            fetch,
            start: '2024-06-13'
        }
    }
}

export default adapter;
