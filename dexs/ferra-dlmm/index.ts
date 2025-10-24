import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const fetchData = () => {
    return async ({ startTimestamp, endTimestamp }: FetchOptions) => {
        const dailyVolume = (await fetchURL(`https://stats.ferra.ag/api/stats/dlmm/volume?from_timestamp=${startTimestamp}&to_timestamp=${endTimestamp}`)).data.volume;
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
            start: '2025-10-07',
        }
    }
};

export default adapter;