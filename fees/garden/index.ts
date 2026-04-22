import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const chainMapper: Record<string, { name: string, start: string, primaryCGToken: string }> = {
    [CHAIN.ETHEREUM]: { name: "ethereum", start: "2023-08-23", primaryCGToken: 'ethereum' },
    [CHAIN.BITCOIN]: { name: "bitcoin", start: "2023-08-23", primaryCGToken: 'bitcoin' },
    [CHAIN.ARBITRUM]: { name: "arbitrum", start: "2023-08-23", primaryCGToken: 'ethereum' },
    [CHAIN.BASE]: { name: "base", start: "2024-12-11", primaryCGToken: 'ethereum' },
    [CHAIN.UNICHAIN]: { name: "unichain", start: "2025-04-17", primaryCGToken: 'ethereum' },
    [CHAIN.BERACHAIN]: { name: "bera", start: "2025-02-10", primaryCGToken: 'ethereum' },
    [CHAIN.STARKNET]: { name: "starknet", start: "2023-08-23", primaryCGToken: 'starknet' },
    [CHAIN.HYPERLIQUID]: { name: "hyperliquid", start: "2025-04-17", primaryCGToken: 'hyperliquid' },
    [CHAIN.BSC]: { name: "bnbchain", start: "2025-07-28", primaryCGToken: 'binancecoin' },
    [CHAIN.CORN]: { name: "corn", start: "2025-03-30", primaryCGToken: 'corn-3' },
    [CHAIN.SUI]: { name: "sui", start: "2025-08-14", primaryCGToken: 'sui' },
    [CHAIN.SOLANA]: { name: "solana", start: "2025-08-07", primaryCGToken: 'solana' },
    [CHAIN.MONAD]: { name: "monad", start: "2025-11-24", primaryCGToken: 'monad' },
};

// Decimals for each asset key (chain:token)
const assetDecimals: Record<string, number> = {
    "bitcoin:btc": 8,
    "ethereum:wbtc": 8,
    "ethereum:cbbtc": 8,
    "ethereum:ibtc": 8,
    "ethereum:usdt": 6,
    "ethereum:usdc": 6,
    "arbitrum:wbtc": 8,
    "arbitrum:ibtc": 8,
    "arbitrum:usdc": 6,
    "base:cbbtc": 8,
    "base:cbltc": 8,
    "base:usdc": 6,
    "unichain:wbtc": 8,
    "unichain:usdc": 6,
    "berachain:lbtc": 8,
    "hyperliquid:ubtc": 8,
    "bnbchain:btcb": 18,
    "starknet:wbtc": 8,
    "solana:sol": 9,
    "solana:cbbtc": 8,
    "solana:usdc": 6,
    "solana:usdt": 6,
    "solana:cash": 6,
    "citrea:cbtc": 18,
    "botanix:btc": 18,
    "monad:mon": 18,
    "monad:usdc": 6,
    "corn:btcn": 18,
    "megaeth:btc.b": 8,
    "sui:wbtc": 8,
    "sui:usdc": 6,
    "tron:usdt": 6,
};

const DEFAULT_DECIMALS = 18;

type SwapDetails = {
    chain: string;
    asset: string;
    amount: string;
    filled_amount: string;
    asset_price: number;
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
    };
};

type ChainFees = { [chain: string]: number };

function getUSDValue(swap: SwapDetails, useFilledAmount: boolean): number {
    const amount = useFilledAmount ? swap.filled_amount : swap.amount;
    const decimals = assetDecimals[swap.asset.toLowerCase()] ?? DEFAULT_DECIMALS;
    return (Number(amount) / Math.pow(10, decimals)) * swap.asset_price;
}

const prefetch = async (options: FetchOptions) => {
    return fetchTransactionsInDateRange(options.startTimestamp, options.endTimestamp);
};

async function fetchTransactionsInDateRange(startTimestamp: number, endTimestamp: number) {
    const fees: ChainFees = {};
    let currentPage = 1;
    let insideDateRange = false;
    let shouldContinue = true;

    while (shouldContinue) {
        const response: GardenApiResponse = await fetchURL(
            `https://api.garden.finance/v2/orders?status=completed&per_page=500&page=${currentPage}`
        );
        if (response.status !== "Ok" || !response.result.data.length) break;

        for (const tx of response.result.data) {
            const txTimestamp = new Date(tx.created_at).getTime() / 1000;

            if (!insideDateRange && txTimestamp > endTimestamp) continue;

            if (txTimestamp <= endTimestamp && txTimestamp >= startTimestamp) {
                insideDateRange = true;
                const { source_swap, destination_swap } = tx;
                if (Number(destination_swap.filled_amount) === 0) continue;
                const sourceUSD = getUSDValue(source_swap, false);
                const destUSD = getUSDValue(destination_swap, true);
                const fee = sourceUSD - destUSD;
                if (fee > 0) {
                    const chain = source_swap.chain;
                    fees[chain] = (fees[chain] ?? 0) + fee;
                }
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
    const dailyRevenue = options.createBalances();
    const chainName = chainMapper[options.chain].name;
    const feeAmount = fees[chainName] ?? 0;
    dailyFees.addUSDValue(feeAmount);
    dailyRevenue.addUSDValue(feeAmount * (23 / 30));

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    };
};

const methodology = {
    Fees: "Swap fees paid by users",
    UserFees: "Swap fees paid by users",
    Revenue: "Percentage of swap fees going to solvers and/or token holders",
    ProtocolRevenue: "Fees going to treasury",
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    methodology,
    adapter: chainMapper,
    prefetch: prefetch as any,
};

export default adapter;
