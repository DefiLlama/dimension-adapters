import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const chainMapper: Record<string, { name: string, start: string, primaryCGToken: string, decimals: number }> = {
    [CHAIN.ETHEREUM]: {
        name: "ethereum",
        start: "2023-08-23",
        primaryCGToken: 'ethereum',
        decimals: 18
    },
    [CHAIN.BITCOIN]: {
        name: "bitcoin",
        start: "2023-08-23",
        primaryCGToken: 'bitcoin',
        decimals: 8
    },
    [CHAIN.ARBITRUM]: {
        name: "arbitrum",
        start: "2023-08-23",
        primaryCGToken: 'ethereum',
        decimals: 18
    },
    [CHAIN.BASE]: {
        name: "base",
        start: "2024-12-11",
        primaryCGToken: 'ethereum',
        decimals: 18
    },
    [CHAIN.UNICHAIN]: {
        name: "unichain",
        start: "2025-04-17",
        primaryCGToken: 'ethereum',
        decimals: 18
    },
    [CHAIN.BERACHAIN]: {
        name: "bera",
        start: "2025-02-10",
        primaryCGToken: 'ethereum',
        decimals: 18
    },
    [CHAIN.STARKNET]: {
        name: "starknet",
        start: "2023-08-23",
        primaryCGToken: 'starknet',
        decimals: 18
    },
    [CHAIN.HYPERLIQUID]: {
        name: "hyperliquid",
        start: "2025-04-17",
        primaryCGToken: 'hyperliquid',
        decimals: 18
    },
    [CHAIN.BSC]: {
        name: "bnbchain",
        start: "2025-07-28",
        primaryCGToken: 'binancecoin',
        decimals: 18
    },
    [CHAIN.CORN]: {
        name: "corn",
        start: "2025-03-30",
        primaryCGToken: 'corn-3',
        decimals: 18
    },
    [CHAIN.SUI]: {
        name: "sui",
        start: "2025-08-14",
        primaryCGToken: 'sui',
        decimals: 9
    },
    [CHAIN.SOLANA]: {
        name: "solana",
        start: "2025-08-07",
        primaryCGToken: 'solana',
        decimals: 9
    },
    [CHAIN.MONAD]: {
        name: "monad",
        start: "2025-11-24",
        primaryCGToken: 'monad',
        decimals: 18
    },
};
const baseUrl = "https://api.garden.finance/orders";

type SwapDetails = {
    chain: string;
    filled_amount: string;
    token_address: string;
    initiate_timestamp: string;
};

type GardenTransaction = {
    created_at: string;
    source_swap: SwapDetails;
    destination_swap: SwapDetails;
};

type GardenApiResponse = {
    status: string;
    result: {
        data: GardenTransaction[];
        page: number;
        total_pages: number;
        total_items: number;
        per_page: number;
    };
};

type ChainVolumes = {
    [chain: string]: {
        [tokenAddress: string]: string;
    };
};

type VolumeCounters = {
    sameChain: ChainVolumes;
    crossChain: ChainVolumes;
};

function addToVolume(volumes: ChainVolumes, chain: string, tokenAddress: string, amount: string) {
    if (!volumes[chain]) {
        volumes[chain] = {};
    }
    if (!volumes[chain][tokenAddress]) {
        volumes[chain][tokenAddress] = "0";
    }
    volumes[chain][tokenAddress] = (
        Number(volumes[chain][tokenAddress]) + Number(amount)
    ).toString();
}

const prefetch = async (options: FetchOptions) => {
    return await fetchTransactionsInDateRange(
        options.startTimestamp,
        options.endTimestamp
    );
}

async function fetchTransactionsInDateRange(startTimestamp: number, endTimestamp: number) {
    const volumes = { sameChain: {}, crossChain: {} };
    let currentPage = 1;
    let insideDateRange = false;
    let shouldContinue = true;

    while (shouldContinue) {
        const response: GardenApiResponse = await fetchURL(
            `${baseUrl}/matched?page=${currentPage}&per_page=200&status=completed`
        );
        if (response.status !== "Ok" || !response.result.data.length) {
            break;
        }
        for (const tx of response.result.data) {
            const txTimestamp = new Date(tx.created_at).getTime() / 1000;
            if (!insideDateRange && txTimestamp > endTimestamp) {
                continue;
            }
            if (txTimestamp <= endTimestamp && txTimestamp >= startTimestamp) {
                if (!insideDateRange) {
                    insideDateRange = true;
                }
                const { source_swap, destination_swap } = tx;
                addToVolume(
                    source_swap.chain === destination_swap.chain ? volumes.sameChain : volumes.crossChain,
                    source_swap.chain,
                    source_swap.token_address,
                    source_swap.filled_amount
                );
            }
            if (insideDateRange && txTimestamp < startTimestamp) {
                shouldContinue = false;
                break;
            }
        }
        if (shouldContinue && currentPage < response.result.total_pages) {
            currentPage++;
        } else {
            break;
        }
    }
    return volumes;
}

const fetch = async (options: FetchOptions) => {
    const volumes = options.preFetchedResults as VolumeCounters || { sameChain: {}, crossChain: {} };
    const dailyBridgeVolume = options.createBalances();
    const chainName = chainMapper[options.chain].name;

    const crossChainVolumes = volumes.crossChain[chainName] || {};
    for (const [tokenAddress, volume] of Object.entries(crossChainVolumes)) {
        if (tokenAddress === 'primary') {
            dailyBridgeVolume.addCGToken(chainMapper[options.chain].primaryCGToken, Number(volume) / 10 ** chainMapper[options.chain].decimals)
        } else {
            dailyBridgeVolume.add(tokenAddress, volume);
        }
    }

    return {
        dailyBridgeVolume,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    adapter: chainMapper,
    prefetch: prefetch as any
};

export default adapter;