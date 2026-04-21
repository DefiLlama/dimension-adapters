import { Adapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Define the URL of the endpoint
const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';

// Function to make the GET request
const fetch = async (_: any, _tt: any, options: FetchOptions) => {
    const dayTimestamp = options.startOfDay
    const historicalFeesRes = (await fetchURL(AllezLabsKaminoFeeEndpoint));
    const dateStr = new Date(dayTimestamp * 1000).toISOString().split('T')[0];

    const record = historicalFeesRes['data'].find((row: any) => row.day === options.dateString)

    if (!record)
        throw new Error(`No record found for date: ${dateStr}`);

    // Calculate total and daily revenue
    const { KaminoLiquidityRevenueUsd, KaminoLiquidityFeesUsd } = record;

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addUSDValue(KaminoLiquidityFeesUsd, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(KaminoLiquidityRevenueUsd, METRIC.SWAP_FEES);
    dailySupplySideRevenue.addUSDValue(KaminoLiquidityFeesUsd - KaminoLiquidityRevenueUsd, METRIC.SWAP_FEES);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Swap fees earned by providing liquidity to pools.Fees data is aggregated by Allez Labs using the Kamino API.",
    Revenue: "Part of swap fees going to the protocol",
    ProtocolRevenue: "Part of swap fees going to the protocol",
    SupplySideRevenue: "Part of swap fees going to the liquidity providers",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Swap fees earned by providing liquidity to pools",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "Part of swap fees going to the protocol",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "Part of swap fees going to the protocol",
    },
    SupplySideRevenue: {
        [METRIC.SWAP_FEES]: "Part of swap fees going to the liquidity providers",
    },
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
    breakdownMethodology,
    allowNegativeValue: true,
}
export default adapter;
