import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

// Define the URL of the endpoint
const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';

// Function to make the GET request
const fetch: Fetch = async (_t: any, _b: any, options: FetchOptions) =>  {
    const historicalFeesRes = await fetchURL(AllezLabsKaminoFeeEndpoint)
    const record = historicalFeesRes['data'].find((row: any) => row.day === options.dateString)
    
    const dailyFee = record.KlendFeesUSD
    const dailyRevenue = record.KaminoRevenueUSD
    
    return {
        dailyFees: dailyFee,
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
        }
    },
    methodology,
}
export default adapter;


