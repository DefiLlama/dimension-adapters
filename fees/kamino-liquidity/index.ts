import { Adapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

// Define the URL of the endpoint
const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';

// Function to make the GET request
const fetch = async (_: any, _tt: any, options: FetchOptions) =>  {
    const dayTimestamp = options.startOfDay
    const historicalFeesRes = (await fetchURL(AllezLabsKaminoFeeEndpoint));
    const dateStr = new Date(dayTimestamp * 1000).toISOString().split('T')[0];

    // Calculate total and daily revenue
    const totalRevenue = historicalFeesRes['data']
    .filter(row => row.timestamp <= dayTimestamp)
    .reduce((acc, {KaminoLiquidityRevenueUsd}) => acc + KaminoLiquidityRevenueUsd, 0);

    const dailyRevenue = historicalFeesRes['data']
        .find(row => row.day.split('T')[0] === dateStr)?.KaminoLiquidityRevenueUsd;

    // Calculate total and daily fees
    const totalFees = historicalFeesRes['data']
    .filter(row => row.timestamp <= dayTimestamp)
    .reduce((acc, {KaminoLiquidityFeesUsd}) => acc + KaminoLiquidityFeesUsd, 0);

    const dailyFees = historicalFeesRes['data']
        .find(row => row.day.split('T')[0] === dateStr)?.KaminoLiquidityFeesUsd;

    return {
        timestamp: dayTimestamp,
        totalRevenue: totalRevenue,
        dailyRevenue,
        totalFees,
        dailyFees
    };
};
const methodology = {
    Revenue: "Revenues are aggregated by Allez Labs using Flipside Crypto data.",
    Fees: "Fees are aggregated by Allez Labs using the Kamino API."
}

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2023-10-12',
        }
    },
    methodology
}
export default adapter;
