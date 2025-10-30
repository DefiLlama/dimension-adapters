import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const AETHIR_ENDPOINT = "https://dashboard-api.aethir.com/protocol/demand-metrics/historical-network-revenue";

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const today = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
    const result = (await fetchURL(AETHIR_ENDPOINT)).dailyRevenue;
    const dailyFees = result.find((entry: any) => entry.date === today).usdValue;

    const dailyRevenue = dailyFees * 0.2;

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue: dailyFees * 0.8,
    }
}

const methodology = {
    Fees: "Service fees paid by developers to use aethir GPU services",
    Revenue: "20% protocol fees charged by aethir",
    ProtocolRevenue: "All revenue goes to protocol",
    SupplySideRevenue: "80% of the service fees goes to GPU service providers"
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.ARBITRUM],
    start: '2024-07-22',
    methodology,
}

export default adapter;