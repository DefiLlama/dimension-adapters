import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const methodology = {
    Fees: 'Protocol fees on the rewards.',
    ProtocolRevenue: 'A Part of protocol fees are charged as revenue.',
};

const fetchData = () => {
    return async ({ startTimestamp, endTimestamp }: FetchOptions) => {
        const fees = (await fetchURL(`https://haedal.xyz/api/v1/wal/vault/fees?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`)).data;
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000))
        return {
            dailyFees: fees.fee,
            dailyRevenue: fees.revenue,
            dailyProtocolRevenue: fees.revenue,
            timestamp: dayTimestamp,
        };
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetchData(),
            start: '2025-3-20',
        }
    },
    methodology,
};

export default adapter;