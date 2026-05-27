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
    "bera:lbtc": 8,
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
    "hyperevm:ubtc": 8,
    "litecoin:ltc": 8,
};

// Garden fee split: solvers earn 7/30, protocol retains 23/30
const SOLVER_SHARE = 7 / 30;
const PROTOCOL_SHARE = 23 / 30;

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

function getUSDValue(swap: SwapDetails): number {
    const assetKey = swap.asset.toLowerCase();
    const decimals = assetDecimals[assetKey];
    if (decimals === undefined) {
        console.warn(`garden fees: unknown asset "${swap.asset}", skipping`);
        return 0;
    }
    return (Number(swap.amount) / Math.pow(10, decimals)) * swap.asset_price;
}

const prefetch = async (options: FetchOptions) => {
    const { fees, sameChainVolume } = await fetchTransactionsInDateRange(options.startTimestamp, options.endTimestamp);
    return {
        fees: JSON.stringify(fees),
        sameChainVolume: JSON.stringify(sameChainVolume),
    };
};

async function fetchTransactionsInDateRange(startTimestamp: number, endTimestamp: number) {
    const fees: ChainFees = {};
    const sameChainVolume: ChainFees = {};
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
                const sourceChain = source_swap.chain;
                const destChain = destination_swap.chain;

                if (Number(destination_swap.filled_amount) === 0) continue;
                const sourceUSD = getUSDValue(source_swap);
                const destUSD = getUSDValue(destination_swap);
                if (sourceUSD === 0 || destUSD === 0) continue;
                const fee = sourceUSD - destUSD;
                const chain = source_swap.chain;
                fees[chain] = (fees[chain] ?? 0) + fee;

                if (sourceChain === destChain) {
                    sameChainVolume[sourceChain] = (sameChainVolume[sourceChain] ?? 0) + sourceUSD;
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
    return { fees, sameChainVolume };
}

const fetch = async (options: FetchOptions) => {
    const { fees: feesStr, sameChainVolume: sameChainVolumeStr } = options.preFetchedResults || {};
    const fees: ChainFees = feesStr ? JSON.parse(feesStr) : {};
    const sameChainVolume: ChainFees = sameChainVolumeStr ? JSON.parse(sameChainVolumeStr) : {};
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyVolume = options.createBalances();

    const chainName = chainMapper[options.chain].name;
    const feeAmount = fees[chainName] ?? 0;
    const sameChainVolumeAmount = sameChainVolume[chainName] ?? 0;

    dailyVolume.addUSDValue(sameChainVolumeAmount);
    dailyFees.addUSDValue(feeAmount);
    dailyRevenue.addUSDValue(feeAmount * PROTOCOL_SHARE);
    dailySupplySideRevenue.addUSDValue(feeAmount * SOLVER_SHARE);

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: "Swap fees paid by users",
    UserFees: "Swap fees paid by users",
    Revenue: "77% of swap fees go to the protocol treasury",
    ProtocolRevenue: "77% of swap fees go to the protocol treasury",
    SupplySideRevenue: "23% of swap fees go to solvers",
};


const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    methodology,
    adapter: chainMapper,
    prefetch,
    allowNegativeValue: true,
};

export default adapter;
