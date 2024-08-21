import { Adapter, FetchV2 } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";

// Define the URL of the endpoint
const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';
const KaminoStartTimestamp = 1697068700;

// Function to make the GET request
const fetch: FetchV2 = async ({ endTimestamp }) =>  {
    const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(endTimestamp);
    const historicalFeesRes = (await fetchURL(AllezLabsKaminoFeeEndpoint));

    const totalFee = historicalFeesRes['data']
    .filter(row => row.timestamp <= dayTimestamp)
    .reduce((acc, {KlendFeesUsd}) => acc + KlendFeesUsd, 0);

    const totalRevenue = historicalFeesRes['data']
    .filter(row => row.timestamp <= dayTimestamp)
    .reduce((acc, {KlendRevenueUsd}) => acc + KlendRevenueUsd, 0);
    

    const dailyFee = historicalFeesRes['data']
    .find(row => Math.abs(row.timestamp - dayTimestamp) < 3600*24 - 1)?.KlendFeesUsd;
    
    const dailyRevenue = historicalFeesRes['data']
    .find(row => Math.abs(row.timestamp - dayTimestamp) < 3600*24 - 1)?.KlendRevenueUsd;
    
    return {
        timestamp: dayTimestamp,
        totalFees: `${totalFee}`,
        dailyFees: `${dailyFee}`,
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


