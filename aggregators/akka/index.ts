import fetchURL from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const URL = 'https://routerv2.akka.finance';
const endpoint = '/v2/1116/statistics/dappradar';
const startTimestamp = 1717200000;// 6/1/2024

interface IAPIResponse {
    dailyVolume: string;
    totalVolume: string;
}

const fetch = async (timestamp: number): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const { dailyVolume, totalVolume }: IAPIResponse = (await fetchURL(`${URL}${endpoint}`));
    return {
        dailyVolume,
        totalVolume,
        timestamp: dayTimestamp,
    };
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.CORE]: {
            fetch,
            runAtCurrTime: true,
            start: startTimestamp,
        },
    },
};

export default adapter;
