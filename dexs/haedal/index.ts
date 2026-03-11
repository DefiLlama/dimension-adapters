import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const fetchData = () => {
    return async ({ startTimestamp, endTimestamp }: FetchOptions) => {
        const dailyVolume = (await fetchURL(`https://haedal.xyz/api/v1/hmm/volume?poolObjectId=&fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`)).data.volume;
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000))
        return {
            dailyVolume: dailyVolume,
            timestamp: dayTimestamp,
        };
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetchData(),
            start: '2024-12-17',
        }
    }
};

export default adapter;