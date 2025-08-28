import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const feesQueryURL = "https://no.moar.market/fees?timestamp=";

interface FeesResponse {
    startTimestamp: number;
    endTimestamp: number;
    userFees: Record<string, number>;
    revenue: Record<string, number>;
    supplySideRevenue: Record<string, number>;
}

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
    const feesResponse: FeesResponse = (await fetchURL(`${feesQueryURL}${timestamp}`));

    const dailyFees = options.createBalances()
    for (const [token, amount] of Object.entries(feesResponse.userFees)) {
        dailyFees.add(token, amount)
    }
    const dailyRevenue = options.createBalances()
    for (const [token, amount] of Object.entries(feesResponse.revenue)) {
        dailyRevenue.add(token, amount)
    }
    const dailySupplySideRevenue = options.createBalances()
    for (const [token, amount] of Object.entries(feesResponse.supplySideRevenue)) {
        dailySupplySideRevenue.add(token, amount)
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.APTOS]: {
            fetch,
            start: '2025-05-07',
        },
    },
    methodology: {
        Fees: "Sum of all fees, interest accrued and all liquidation penalty",
        Revenue: "Sum of all protocol fee, and fee on interest accrued and all liquidation penalties",
        ProtocolRevenue: "Sum of all protocol fee, and fee on interest accrued and all liquidation penalties",
        SupplySideRevenue: "LP's share of all interest accrued",
    }
};

export default adapter;
