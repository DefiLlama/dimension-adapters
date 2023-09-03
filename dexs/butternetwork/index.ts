import {SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL"

const endpoint = (chainId: number) => `https://makalu-api.mapscan.io/bridge/api/queryBridgeVolume?chainId=${chainId}`;

const chainIds: { [chain: string]: number } = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.BSC]: 56,
    [CHAIN.MAP]: 22776,
};


interface IAPIResponse {
    code: number;
    message: string;
    data: {
        totalVolume: number,
        volume: number,
        timestamp: number
    }
}

const fetch = (chainId: number) => async (timestamp: number) => {
    const response: IAPIResponse = (await fetchURL(endpoint(chainId))).data;
    return {
        timestamp: response.data.timestamp ? response.data.timestamp : timestamp,
        dailyVolume: response.data.volume,
        totalVolume: response.data.totalVolume,
    };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(chainIds).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: fetch(chainIds[chain]),
                start: async () => 0,
                runAtCurrTime: true
            }
        }
    }, {})
};

export default adapter;
