import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const todayStart = new Date(options.startOfDay * 1000).toISOString();
    const todayEnd = new Date(options.endTimestamp * 1000).toISOString();

    const result = (await fetchURL(`https://lightalytics.com/api/v1/stats/network/fees_history?exchange=lighter&from=${todayStart}&to=${todayEnd}&interval=1d&value=period`)).series;

    const dailyFees = result[0].revenue_24h_usd;

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees
    }
}

const methodology = {
    Fees: "Maker and taker fees paid by premium accounts",
    Revenue: "All fees are revenue",
    ProtocolRevenue: "All the fees goes to protocol"
};

const adapter: SimpleAdapter = {
    fetch,
    start: '2025-10-22',
    chains: [CHAIN.ZK_LIGHTER],
    methodology
}

export default adapter;