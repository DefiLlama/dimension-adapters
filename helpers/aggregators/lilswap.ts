import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../chains";
import fetchURL from "../../utils/fetchURL";

// Chain names accepted by LilSwap's public metrics endpoint.
// An unknown name returns an empty result instead of an error, so keep these exact.
export const lilswapChainAliases: Record<string, string> = {
    [CHAIN.ETHEREUM]: "ethereum",
    [CHAIN.BSC]: "bnb",
    [CHAIN.POLYGON]: "polygon",
    [CHAIN.BASE]: "base",
    [CHAIN.ARBITRUM]: "arbitrum",
    [CHAIN.AVAX]: "avalanche",
    [CHAIN.OPTIMISM]: "optimism",
    [CHAIN.XDAI]: "gnosis",
    [CHAIN.SONIC]: "sonic",
    [CHAIN.UNICHAIN]: "unichain",
    [CHAIN.LINEA]: "linea",
    [CHAIN.PLASMA]: "plasma",
    [CHAIN.INK]: "ink",
    [CHAIN.ROBINHOOD]: "robinhood",
    [CHAIN.HYPERLIQUID]: "hyperevm",
    [CHAIN.SOLANA]: "solana",
    [CHAIN.BITCOIN]: "bitcoin",
}

const BASE_URL = 'https://api.lilswap.xyz/v1/metrics/daily';

type LilSwapBridgeMetrics = {
    txCount: number;
    volumeUsd: string;
    feesUsd: string;
    revenueUsd: string;
    supplySideRevenueUsd: string;
}

export type LilSwapDailyRow = {
    date: string;
    chain: string;
    volumeUsd: string;
    feesUsd: string;
    revenueUsd: string;
    protocolRevenueUsd: string;
    supplySideRevenueUsd: string;
    txCount: number;
    bridge?: LilSwapBridgeMetrics | null;
}

/**
 * Fetches LilSwap's public daily metrics for the current chain and day.
 * @returns the endpoint row for that chain and day, or undefined when there was no activity.
 */
export async function fetchLilSwapDailyMetrics(options: FetchOptions): Promise<LilSwapDailyRow | undefined> {
    const chainAlias = lilswapChainAliases[options.chain];

    const response = await fetchURL(`${BASE_URL}?start=${options.fromTimestamp}&end=${options.toTimestamp}&chain=${chainAlias}`);

    if (!response.data) {
        throw new Error(`No data found for chain ${options.chain} on ${options.dateString}`);
    }

    const rows = response.data as LilSwapDailyRow[];
    return rows.find((row) => row.date === options.dateString);
}
