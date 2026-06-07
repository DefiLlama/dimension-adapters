import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
    Fees: 'Staking rewards.',
    Revenue: 'Percentage of user rewards paid to protocol.',
    ProtocolRevenue: 'Percentage of user rewards paid to protocol.',
};

const fetch = async ({ startTimestamp, endTimestamp, startOfDay }: FetchOptions) => {
    const res = (await fetchURL(`https://haedal.xyz/api/v1/wal/haedal-protocol/fees?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`)).data;

    return {
        dailyFees: res.fee,
        dailyRevenue: res.revenue,
        dailyProtocolRevenue: res.revenue,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.SUI],
    start: '2023-8-24',
    runAtCurrTime: true,
    methodology,
};

export default adapter;