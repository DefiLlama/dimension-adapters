import { Balances } from "@defillama/sdk";
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

// The market list endpoint silently caps pageSize at 200, so a single request for 1000
// returns only the first 200 of the markets it reports in `total`.
const MARKET_PAGE_SIZE = 200;

async function prefetch(_options: FetchOptions): Promise<any> {
    const marketListUrl = (page: number) =>
        `https://api.lista.org/api/moolah/borrow/marketList?page=${page}&pageSize=${MARKET_PAGE_SIZE}`;

    const firstPage: MarketResponse = await getConfig('lsita-dex-marketList-1', marketListUrl(1));
    const list = [...(firstPage.data?.list ?? [])];
    const pageCount = Math.ceil((firstPage.data?.total ?? 0) / MARKET_PAGE_SIZE);

    for (let page = 2; page <= pageCount; page++) {
        const nextPage: MarketResponse = await getConfig(`lsita-dex-marketList-${page}`, marketListUrl(page));
        list.push(...(nextPage.data?.list ?? []));
    }

    return { ...firstPage, data: { ...firstPage.data, list } };
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
    v3Swap:
        "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
    v3Slot0:
        "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
};

// V3 (Uniswap V3 fork) pools: the fee is charged on the input token (the positive amount) and the
// protocol keeps 1/feeProtocol of it, with one 4-bit denominator per token packed into slot0.feeProtocol.
const addV3Swaps = async (options: FetchOptions, pools: string[], token0s: string[], balances: Record<string, Balances>) => {
    const { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue } = balances;
    const [token1s, feeTiers, slot0s] = await Promise.all([
        options.api.multiCall({ abi: "address:token1", calls: pools }),
        options.api.multiCall({ abi: "uint24:fee", calls: pools }),
        options.api.multiCall({ abi: abi.v3Slot0, calls: pools }),
    ]);
    const logsByPool = await options.getLogs({ targets: pools, eventAbi: abi.v3Swap, flatten: false });

    pools.forEach((_pool, i) => {
        const feeTier = BigInt(feeTiers[i]);
        const feeProtocol = Number(slot0s[i].feeProtocol);
        (logsByPool[i] || []).forEach((log: any) => {
            const zeroForOne = BigInt(log.amount0) > 0n;
            const tokenIn = zeroForOne ? token0s[i] : token1s[i];
            const amountIn = BigInt(zeroForOne ? log.amount0 : log.amount1);
            const protocolDenominator = BigInt(zeroForOne ? feeProtocol & 0x0f : feeProtocol >> 4);
            const fee = (amountIn * feeTier) / 1_000_000n;
            const protocolFee = protocolDenominator > 0n ? fee / protocolDenominator : 0n;
            dailyVolume.add(tokenIn, amountIn);
            dailyFees.add(tokenIn, fee, METRIC.SWAP_FEES);
            dailyRevenue.add(tokenIn, protocolFee, METRIC.SWAP_FEES);
            dailySupplySideRevenue.add(tokenIn, fee - protocolFee, METRIC.SWAP_FEES);
        });
    });
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

    // V3 pools expose token0(); StableSwap pools only have coins(i). A pool answering neither is a
    // failed read, so throw rather than silently count it as a StableSwap pool with no swaps.
    const calls = pools.map((p) => p.pool);
    const [v3Token0s, stableCoins0] = await Promise.all([
        options.api.multiCall({ abi: "address:token0", calls, permitFailure: true }),
        options.api.multiCall({ abi: "function coins(uint256) view returns (address)", calls: calls.map((target) => ({ target, params: [0] })), permitFailure: true }),
    ]);
    pools.forEach((p, i) => {
        if (!v3Token0s[i] && !stableCoins0[i]) throw new Error(`lista-dex: cannot classify pool ${p.pool}`);
    });
    const isV3 = pools.map((_, i) => !!v3Token0s[i]);
    const v3Pools = pools.filter((_, i) => isV3[i]).map((p) => p.pool);
    const stablePools = pools.filter((_, i) => !isV3[i]);

    if (v3Pools.length) await addV3Swaps(options, v3Pools, v3Token0s.filter((_, i) => isV3[i]), { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue });

    const logsByTarget = stablePools.length ? await options.getLogs({
        targets: stablePools.map((p) => p.pool),
        eventAbi: abi.tokenExchange,
        flatten: false,
        onlyArgs: false,
    }) : [];

    const allSwapEvents: SwapEventArgs[] = [];
    stablePools.forEach((pool, idx) => {
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
    Volume: "Total token swap volume across all Lista DEX pools (StableSwap and V3).",
    Fees: "Total swap fees paid by users.",
    UserFees: "Users pay fees per swap.",
    Revenue: "Lista DAO takes a portion of swap fees (StableSwap admin fee; V3 pool protocol fee from slot0.feeProtocol).",
    ProtocolRevenue: "Lista DAO takes a portion of swap fees (StableSwap admin fee; V3 pool protocol fee from slot0.feeProtocol).",
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
        [METRIC.SWAP_FEES]: "Lista DAO takes a portion of swap fees (StableSwap admin fee; V3 pool protocol fee from slot0.feeProtocol).",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "Lista DAO takes a portion of swap fees (StableSwap admin fee; V3 pool protocol fee from slot0.feeProtocol).",
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
