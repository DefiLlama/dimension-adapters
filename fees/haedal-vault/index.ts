import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const methodology = {
    Fees: 'Protocol fees on the rewards.',
    ProtocolRevenue: 'A Part of protocol fees are charged as revenue.',
};

const fetch = async ({ startTimestamp, endTimestamp, startOfDay }: FetchOptions) => {
    const fees = (await fetchURL(`https://haedal.xyz/api/v1/wal/vault/fees?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`)).data;
    return {
        dailyFees: fees.fee,
        dailyRevenue: fees.revenue,
        dailyProtocolRevenue: fees.revenue,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.SUI],
    start: '2025-03-20',
    methodology,
};

export default adapter;