import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const chainAliases: Record<string, string> = {
    [CHAIN.ETHEREUM]: "ethereum",
    [CHAIN.BSC]: "bnb",
    [CHAIN.POLYGON]: "polygon",
    [CHAIN.BASE]: "base",
    [CHAIN.ARBITRUM]: "arbitrum",
    [CHAIN.AVAX]: "avalanche",
    [CHAIN.OPTIMISM]: "optimism",
    [CHAIN.XDAI]: "gnosis",
    [CHAIN.SONIC]: "sonic",
}

const BASE_URL = 'https://api.lilswap.xyz/v1/metrics/daily';

const LABELS = {
    FEES: "Explicit Swap Fees",
    REVENUE: "Explicit Swap Fees To Protocol",
    SUPPLY_SIDE: "Explicit Swap Fees To External Partners",
}

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyVolume = options.createBalances();

    const chainAlias = chainAliases[options.chain];

    const response = await fetchURL(`${BASE_URL}?start=${options.fromTimestamp}&end=${options.toTimestamp}&chain=${chainAlias}`);

    if (!response.data) {
        throw new Error(`No data found for chain ${options.chain} on ${options.dateString}`);
    }

    const todaysData = response.data.find((item: any) => item.date === options.dateString);

    if (todaysData) {
        dailyFees.addUSDValue(Number(todaysData.feesUsd), LABELS.FEES);
        dailyRevenue.addUSDValue(Number(todaysData.revenueUsd), LABELS.REVENUE);
        dailySupplySideRevenue.addUSDValue(Number(todaysData.supplySideRevenueUsd), LABELS.SUPPLY_SIDE);
        dailyVolume.addUSDValue(Number(todaysData.volumeUsd));
    }

    return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
    Fees: "Includes explicit LilSwap fees from confirmed swaps sourced from LilSwap's public daily metrics endpoint.",
    UserFees: "Users pay LilSwap's explicit swap fees on confirmed swaps, sourced from LilSwap's public daily metrics endpoint.",
    Revenue: "LilSwap retained explicit swap fees, sourced from LilSwap's public daily metrics and computed as total explicit fees minus the external partner fee share.",
    ProtocolRevenue: "Same as daily revenue, computed from the explicit fee split as dailyFees minus dailySupplySideRevenue.",
    SupplySideRevenue: "External partner fee share sourced from LilSwap's public daily metrics endpoint.",
}

const breakdownMethodology = {
    Fees: {
        [LABELS.FEES]: "Explicit LilSwap fees from confirmed swaps.",
    },
    UserFees: {
        [LABELS.FEES]: "Explicit LilSwap fees from confirmed swaps.",
    },
    Revenue: {
        [LABELS.REVENUE]: "Explicit LilSwap fees minus external partner fee share.",
    },
    ProtocolRevenue: {
        [LABELS.REVENUE]: "Explicit LilSwap fees minus external partner fee share.",
    },
    SupplySideRevenue: {
        [LABELS.SUPPLY_SIDE]: "External partner fee share.",
    },
}

const adapter: SimpleAdapter = {
    fetch,
    start: '2026-02-25',
    chains: Object.keys(chainAliases),
    methodology,
    breakdownMethodology,
}

export default adapter;
