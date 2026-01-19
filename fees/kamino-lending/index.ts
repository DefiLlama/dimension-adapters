import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';

const fetch: Fetch = async (_t: any, _b: any, options: FetchOptions) =>  {
    const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
    const dateString = new Date(startOfDay * 1000).toISOString().split('T')[0];
    
    const historicalFeesRes = await fetchURL(AllezLabsKaminoFeeEndpoint);
    
    // Defensively normalize the response to an array
    const data = Array.isArray(historicalFeesRes?.data) ? historicalFeesRes.data : [];
    const dayData = data.find(row => row.day === dateString);
    
    // Return zeros if data doesn't exist yet (API typically has 2-3 day delay)
    if (!dayData) {
        return {
            timestamp: startOfDay,
            dailyFees: "0",
            dailyRevenue: "0"
        };
    }
    
    return {
        timestamp: startOfDay,
        dailyFees: dayData.KlendFeesUSD ?? "0",
        dailyRevenue: dayData.KaminoRevenueUSD ?? "0"
    };
};

const methodology = {
    Fees: "Fees are aggregated by Allez Labs using the Kamino API"
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2023-10-12',
        }
    },
    methodology,
}

export default adapter;