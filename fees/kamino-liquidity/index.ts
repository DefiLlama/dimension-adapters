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

    const totalRevenue = historicalFeesRes['data']
    .filter(row => row.timestamp <= dayTimestamp)
    .reduce((acc, {KaminoLiquidityRevenueUsd}) => acc + KaminoLiquidityRevenueUsd, 0);
    
    const dailyRevenue = historicalFeesRes['data']
    .find(row => Math.abs(row.timestamp - dayTimestamp) < 3600*24 - 1)?.KaminoLiquidityRevenueUsd;
    
    return {
        timestamp: dayTimestamp,
        totalRevenue: `${totalRevenue}`,
        dailyRevenue: `${dailyRevenue}`
    };
};
const methodology = {
    Fees: "Fees are aggregated by Allez Labs using the Kamino API"
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


