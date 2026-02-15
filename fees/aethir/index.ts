import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
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

const breakdownMethodology = {
    Fees: {
        [METRIC.SERVICE_FEES]: "Service fees paid by developers for GPU compute resources on the Aethir network"
    },
    Revenue: {
        [METRIC.PROTOCOL_FEES]: "20% of service fees retained by Aethir protocol"
    },
    ProtocolRevenue: {
        [METRIC.PROTOCOL_FEES]: "All protocol revenue goes to Aethir treasury"
    },
    SupplySideRevenue: {
        [METRIC.OPERATORS_FEES]: "80% of service fees distributed to GPU service providers (operators) who supply compute resources"
    }
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.ARBITRUM],
    start: '2024-07-22',
    methodology,
    breakdownMethodology,
}

export default adapter;