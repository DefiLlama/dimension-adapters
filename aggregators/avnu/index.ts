import fetchURL from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const URL = 'https://starknet.api.avnu.fi';
const endpoint = '/v1/analytics/volumes/';
const startTimestamp = 1684108800;// 15.05.2023

interface IAPIResponse {
    date: number;
    dailyVolume: string;
    totalVolume: string;
}
const fetch = async (timestamp: number): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const {dailyVolume, totalVolume}: IAPIResponse = (await fetchURL(`${URL}${endpoint}${timestamp * 1000}`));
    return {
        dailyVolume,
        totalVolume,
        timestamp: dayTimestamp,
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.STARKNET]: {
          fetch,
          start: startTimestamp,
        },
    },
};

export default adapter;
