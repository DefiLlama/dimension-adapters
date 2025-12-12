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

type CreateOrder = {
    source_chain: string;
    fee: string;
};

type GardenTransaction = {
    created_at: string;
    source_swap: SwapDetails;
    destination_swap: SwapDetails;
    create_order: CreateOrder;
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

type ChainFees = {
    [chain: string]: number;
};

function addToFees(fees: ChainFees, chain: string, feeAmount: string) {
    if (!fees[chain]) {
        fees[chain] = 0;
    }
    fees[chain] += Number(feeAmount);
}

const prefetch = async (options: FetchOptions) => {
    return await fetchTransactionsInDateRange(
        options.startTimestamp,
        options.endTimestamp
    );
}

async function fetchTransactionsInDateRange(startTimestamp: number, endTimestamp: number) {
    const fees: ChainFees = {};
    let currentPage = 1;
    let insideDateRange = false;
    let shouldContinue = true;

    while (shouldContinue) {
        const response: GardenApiResponse = await fetchURL(
            `${baseUrl}/matched?page=${currentPage}&per_page=1000&status=completed`
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
                const { create_order } = tx;
                addToFees(
                    fees,
                    create_order.source_chain,
                    create_order.fee,
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
    return fees;
}

const fetch = async (options: FetchOptions) => {
    const fees = options.preFetchedResults as ChainFees || {};
    const dailyFees = options.createBalances();
    const chainName = chainMapper[options.chain].name;

    const chainFees = fees[chainName] || 0;
    dailyFees.addUSDValue(chainFees);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const methodology = {
    Fees: "Swap fees paid by users",
    UserFees: "Swap fees paid by users",
    Revenue: "Percentage of swap fees going to solvers and/or token holders",
    ProtocolRevenue: "Fees going to treasury",
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    methodology,
    adapter: chainMapper,
    prefetch: prefetch as any
};

export default adapter;