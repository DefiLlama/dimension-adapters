import { Adapter, Fetch, FetchOptions } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Define the URL of the endpoint
const AllezLabsKaminoFeeEndpoint = 'https://allez-xyz--kamino-fees-api-get-fees-lifetime-kamino.modal.run';
const ORIGINATION_FEES = 'Origination Fees';

// Function to make the GET request
const fetch: Fetch = async (_t: any, _b: any, options: FetchOptions) => {
    const historicalFeesRes = await fetchURL(AllezLabsKaminoFeeEndpoint)
    const record = historicalFeesRes['data'].find((row: any) => row.day === options.dateString)

    if (!record)
        throw new Error(`No record found for date: ${options.dateString}`);

    const { KlendInterestFeesUSD, KlendInterestRevenueUSD, KlendLiquidationFeesUSD, KlendLiquidationRevenueUSD, KlendOriginationFeesUSD } = record;

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addUSDValue(KlendInterestFeesUSD, METRIC.BORROW_INTEREST)
    dailyRevenue.addUSDValue(KlendInterestRevenueUSD, METRIC.BORROW_INTEREST)
    dailySupplySideRevenue.addUSDValue(KlendInterestFeesUSD - KlendInterestRevenueUSD, METRIC.BORROW_INTEREST)

    dailyFees.addUSDValue(KlendLiquidationFeesUSD, METRIC.LIQUIDATION_FEES)
    dailyRevenue.addUSDValue(KlendLiquidationRevenueUSD, METRIC.LIQUIDATION_FEES)
    dailySupplySideRevenue.addUSDValue(KlendLiquidationFeesUSD - KlendLiquidationRevenueUSD, METRIC.LIQUIDATION_FEES)

    dailyFees.addUSDValue(KlendOriginationFeesUSD, ORIGINATION_FEES)
    dailyRevenue.addUSDValue(KlendOriginationFeesUSD, ORIGINATION_FEES)

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Includes interest fees, liquidation fees and origination fees. All fees are aggregated by Allez Labs using the Kamino API",
    Revenue: "Includes interest spreads, part of liquidation fees and all the origination fees.",
    ProtocolRevenue: "All the revenue goes to the protocol",
    SupplySideRevenue: "Includes interests going to lenders and liquidation penalties going to liquidators"
}

const breakdownMethodology = {
    Fees: {
        [METRIC.BORROW_INTEREST]: "Interest fees paid by borrowers",
        [METRIC.LIQUIDATION_FEES]: "Liquidation fees paid by borrowers",
        [ORIGINATION_FEES]: "Origination fees paid by borrowers",
    },
    Revenue: {
        [METRIC.BORROW_INTEREST]: "Interest spreads going to the protocol",
        [METRIC.LIQUIDATION_FEES]: "Part of liquidation fees going to the protocol",
        [ORIGINATION_FEES]: "All the origination fees going to the protocol",
    },
    ProtocolRevenue: {
        [METRIC.BORROW_INTEREST]: "Interest spreads going to the protocol",
        [METRIC.LIQUIDATION_FEES]: "Part of liquidation fees going to the protocol",
        [ORIGINATION_FEES]: "All the origination fees going to the protocol",
    },
    SupplySideRevenue: {
        [METRIC.BORROW_INTEREST]: "Interests going to lenders",
        [METRIC.LIQUIDATION_FEES]: "Liquidation penalties going to liquidators",
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
}
export default adapter;


