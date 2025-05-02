import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";


// Define the URL of the endpoint
const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';

// Function to make the GET request
const fetch: Fetch = async (_t: any, _b: any, options: FetchOptions) =>  {
    const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
    const dateString = new Date(startOfDay * 1000).toISOString().split('T')[0];
    const historicalFeesRes = (await fetchURL(AllezLabsKaminoFeeEndpoint));

    const totalFee = historicalFeesRes['data']
    .filter(row => row.timestamp <= startOfDay)
    .reduce((acc, {KlendFeesUSD}) => acc + Number(KlendFeesUSD || 0), 0);

    const totalRevenue = historicalFeesRes['data']
    .filter(row => row.timestamp <= startOfDay)
    .reduce((acc, {KaminoRevenueUSD}) => acc + Number(KaminoRevenueUSD || 0), 0);
    
    const dailyFee = historicalFeesRes['data']
        .find(row => row.day === dateString).KlendFeesUSD
    
    const dailyRevenue = historicalFeesRes['data']
        .find(row => row.day === dateString).KaminoRevenueUSD
    
    return {
        timestamp: startOfDay,
        totalFees: totalFee,
        dailyFees: dailyFee,
        totalRevenue: totalRevenue,
        dailyRevenue
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
            meta: {
                methodology
            }
        }
    }
}
export default adapter;


