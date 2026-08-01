import { Adapter, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Define the URL of the endpoint
const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';

// Function to make the GET request
const fetch = async (options: FetchOptions) => {
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

    dailyFees.addUSDValue(KaminoLiquidityFeesUsd, "Liquidity vault fees");
    dailyRevenue.addUSDValue(KaminoLiquidityRevenueUsd, "Liquidit vault fees to protocol");
    dailySupplySideRevenue.addUSDValue(KaminoLiquidityFeesUsd - KaminoLiquidityRevenueUsd, "Liquidity vault fees to liquidity providers");

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Swap fees earned by providing liquidity to pools.Fees data is aggregated by Allez Labs using the Kamino API.",
    Revenue: "Part of fees earned by providing liquidity to pools going to the protocol",
    ProtocolRevenue: "Part of fees earned by providing liquidity to pools going to the protocol",
    SupplySideRevenue: "Part of fees earned by providing liquidity to pools going to the liquidity providers",
}

const breakdownMethodology = {
    Fees: {
        "Liquidity vault fees": "Fees earned by providing liquidity to pools",
    },
    Revenue: {
        "Liquidity vault fees to protocol": "Part of fees earned by providing liquidity to pools going to the protocol",
    },
    ProtocolRevenue: {
        "Liquidity vault fees to protocol": "Part of fees earned by providing liquidity to pools going to the protocol",
    },
    SupplySideRevenue: {
        "Liquidity vault fees to liquidity providers": "Part of fees earned by providing liquidity to pools going to the liquidity providers",
    },
}

const adapter: Adapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2023-10-12',
    methodology,
    breakdownMethodology,
    allowNegativeValue: true,
}
export default adapter;
