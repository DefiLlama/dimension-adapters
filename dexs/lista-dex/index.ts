import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";
import { sleep } from "../../utils/utils";
import { getConfig } from "../../helpers/cache";

interface MarketResponse {
    code: string;
    msg: string;
    data: {
        total: number;
        list: Array<{
            marketId: string;
            isSmartLending: boolean;
            chain: string;
        }>;
    };
}

interface PoolInfo {
    pool: string;
    token0: string;
    token1: string;
}

interface SwapEventArgs {
    soldId: bigint;
    tokensSold: bigint;
    swapFee: bigint;
    adminFee: bigint;
    token0: string;
    token1: string;
}

async function prefetch(_options: FetchOptions) {
    return await getConfig('lsita-dex-marketList', `https://api.lista.org/api/moolah/borrow/marketList?page=1&pageSize=1000`);
}

const getSwapPools = async (options: FetchOptions): Promise<PoolInfo[]> => {
    const chain = options.chain;
    const results: MarketResponse = options.preFetchedResults;

    const smartLendingMarkets = results.data.list.filter(
        (market) => market.isSmartLending && market.chain === chain
    );

    const marketDetails: any = await PromisePool.withConcurrency(1).for(smartLendingMarkets).process(async (market: any) => {
        await sleep(1000);
        return await getConfig(`lsita-dex-marketList-${chain}-${market.marketId}`, `https://api.lista.org/api/moolah/market/${market.marketId}?chain=${chain}`).then((res) => res.data);
    });

    const poolsByAddress = new Map<string, PoolInfo>();
    for (const marketDetail of marketDetails.results) {
        if (!marketDetail.smartCollateralConfig) continue;
        const pool = marketDetail.smartCollateralConfig.swapPool.toLowerCase();
        if (poolsByAddress.has(pool)) continue;
        poolsByAddress.set(pool, {
            pool: marketDetail.smartCollateralConfig.swapPool,
            token0: marketDetail.smartCollateralConfig.token0,
            token1: marketDetail.smartCollateralConfig.token1,
        });
    }
    return Array.from(poolsByAddress.values());
};

const abi = {
    tokenExchange:
        "event TokenExchange (address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought, uint256 swap_fee, uint256 admin_fee)",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const pools = await getSwapPools(options);
    if (pools.length === 0) {
        return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue };
    }

    const targets = pools.map((p) => p.pool);

    const logsByTarget = await options.getLogs({
        targets,
        eventAbi: abi.tokenExchange,
        flatten: false,
        onlyArgs: false,
    });

    const allSwapEvents: SwapEventArgs[] = [];
    pools.forEach((pool, idx) => {
        const logs = logsByTarget[idx] || [];
        logs.forEach((log: any) => {
            allSwapEvents.push({
              soldId: log.args.sold_id,
              tokensSold: log.args.tokens_sold,
              swapFee: log.args.swap_fee,
              adminFee: log.args.admin_fee,
              token0: pool.token0,
              token1: pool.token1,
            });
        });
    });

    allSwapEvents.forEach(({ soldId, tokensSold, swapFee, adminFee, token0, token1 }) => {
        const tokenSold = soldId === 0n ? token0 : token1;
        const tokenBought = soldId === 0n ? token1 : token0;
        if (!tokenSold || !tokenBought) return;
        dailyVolume.add(tokenSold, tokensSold);
        dailyFees.add(tokenBought, swapFee, METRIC.SWAP_FEES);
        dailyRevenue.add(tokenBought, adminFee, METRIC.SWAP_FEES);
        dailySupplySideRevenue.add(tokenBought, swapFee - adminFee, METRIC.SWAP_FEES);
    });

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
    Volume: "Total token swap volume across all Lista DEX pools.",
    Fees: "Total swap fees paid by users.",
    UserFees: "Users pay fees per swap.",
    Revenue: "Lista DAO takes a portion of swap fees.",
    ProtocolRevenue: "Lista DAO takes a portion of swap fees.",
    SupplySideRevenue: "Amount of swap fees distributed to LPs.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "Total swap fees paid by users.",
    },
    UserFees: {
        [METRIC.SWAP_FEES]: "Users pay fees per swap.",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "Lista DAO takes a portion of swap fees.",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "Lista DAO takes a portion of swap fees.",
    },
    SupplySideRevenue: {
        [METRIC.SWAP_FEES]: "Amount of swap fees distributed to LPs.",
    },
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    prefetch,
    methodology,
    breakdownMethodology,
    chains: [CHAIN.BSC, CHAIN.ETHEREUM],
    start: "2025-03-01",
    fetch,
};

export default adapter;
