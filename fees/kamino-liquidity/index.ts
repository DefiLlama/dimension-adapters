import { Adapter, FetchV2 } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";

// Define the URL of the endpoint
const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';

// Function to make the GET request
const fetch: FetchV2 = async ({ endTimestamp }) =>  {
    const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(endTimestamp);
    const historicalFeesRes = (await fetchURL(AllezLabsKaminoFeeEndpoint));

    // Calculate total and daily revenue
    const totalRevenue = historicalFeesRes['data']
    .filter(row => row.timestamp <= dayTimestamp)
    .reduce((acc, {KaminoLiquidityRevenueUsd}) => acc + KaminoLiquidityRevenueUsd, 0);
    
    const dailyRevenue = historicalFeesRes['data']
    .find(row => Math.abs(row.timestamp - dayTimestamp) < 3600*24 - 1)?.KaminoLiquidityRevenueUsd;

    // Calculate total and daily fees
    const totalFees = historicalFeesRes['data']
    .filter(row => row.timestamp <= dayTimestamp)
    .reduce((acc, {KaminoLiquidityFeesUsd}) => acc + KaminoLiquidityFeesUsd, 0);

    const dailyFees = historicalFeesRes['data']
    .find(row => Math.abs(row.timestamp - dayTimestamp) < 3600*24 - 1)?.KaminoLiquidityFeesUsd;
    
    return {
        timestamp: dayTimestamp,
        totalRevenue: `${totalRevenue}`,
        dailyRevenue: `${dailyRevenue}`,
        totalFees: `${totalFees}`,
        dailyFees: `${dailyFees}`
    };
};
const methodology = {
    Revenue: "Revenues are aggregated by Allez Labs using Flipside Crypto data.",
    Fees: "Fees are aggregated by Allez Labs using the Kamino API."
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            runAtCurrTime: true,
            start: 1697068700,
            meta: {
                methodology
            }
        }
    }
}
export default adapter;