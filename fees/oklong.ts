import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Your secure Cloudflare Worker Endpoint
const API_ENDPOINT = "https://oklong.io/api/defillama";

interface Response {
    dailyFees: number;
    dailyUserFees: number;
    dailyRevenue: number;
    dailyProtocolRevenue: number;
    totalFees: number;
    totalRevenue: number;
    dailyVolume: number;
    totalVolume: number;
    timestamp: number;
    totalProtocolRevenue: number;
}

const fetch = async (timestamp: number) => {
    // Fetch pre-calculated dimensions from your proxy
    const data = (await httpGet(API_ENDPOINT)) as Response;

    return {
        // FEES (Money entering the system)
        dailyFees: data.dailyFees,
        totalFees: data.totalFees,

        // USER FEES (Money paid by users)
        dailyUserFees: data.dailyUserFees,
        totalUserFees: data.totalFees, // Assuming User Fees = Total Fees

        // REVENUE (Money kept by Oklong)
        dailyRevenue: data.dailyRevenue,
        totalRevenue: data.totalRevenue,

        // PROTOCOL REVENUE (Treasury)
        dailyProtocolRevenue: data.dailyProtocolRevenue,
        totalProtocolRevenue: data.totalProtocolRevenue,

        timestamp: timestamp,
    };
};

const methodology = {
    dailyFees: "Fees are calculated dynamically by fetching the real-time fee rates securely from the Orderly Network via the Oklong API.",
    dailyUserFees: "Transaction fees paid by traders on oklong.io.",
    dailyRevenue: "Revenue represents the portion of trading fees accrued to the Oklong broker."
}

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    adapter: {
        [CHAIN.ORDERLY]: {
            fetch: fetch,
            start: 1761091200, // Launch timestamp (Nov 14, 2023)
            runAtCurrTime: true,

        },
    },
};

export default adapter;