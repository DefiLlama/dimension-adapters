import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const methodology = {
    Fees: 'Staking rewards.',
    Revenue: 'Percentage of user rewards paid to protocol.',
    ProtocolRevenue: 'Percentage of user rewards paid to protocol.',
};

const fetchData = () => {
    return async ({ startTimestamp, endTimestamp }: FetchOptions) => {
        const tres = (await fetchURL(`https://haedal.xyz/api/v1/wal/haedal-protocol/fees?fromTimestamp=&toTimestamp=`)).data;
        const res = (await fetchURL(`https://haedal.xyz/api/v1/wal/haedal-protocol/fees?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`)).data;
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000))
        return {
            totalFees: tres.fee,
            dailyFees: res.fee,
            totalRevenue: tres.revenue,
            dailyRevenue: res.revenue,
            dailyProtocolRevenue: res.revenue,
            timestamp: dayTimestamp,
        };
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetchData(),
            start: '2023-8-24',
            runAtCurrTime: true,
        }
    }
};

export default adapter;