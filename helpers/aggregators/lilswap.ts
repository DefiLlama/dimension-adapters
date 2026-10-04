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

// Returns the endpoint row for the current chain and day, or undefined when there was no activity.
export async function fetchLilSwapDailyMetrics(options: FetchOptions) {
    const chainAlias = lilswapChainAliases[options.chain];

    const response = await fetchURL(`${BASE_URL}?start=${options.fromTimestamp}&end=${options.toTimestamp}&chain=${chainAlias}`);

    if (!response.data) {
        throw new Error(`No data found for chain ${options.chain} on ${options.dateString}`);
    }

    return response.data.find((item: any) => item.date === options.dateString);
}
