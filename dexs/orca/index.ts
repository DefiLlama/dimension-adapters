import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const statsApiEndpoint = "https://stats-api.mainnet.orca.so/api/whirlpools";
const eclipseStatsApiEndpoint = "https://stats-api-eclipse.mainnet.orca.so/api/whirlpools";
const FEE_RATE_DENOMINATOR = 1_000_000;
const FEE_RATE_THRESHOLD = 0; // 
const PROTOCOL_FEE_RATE = .12; // 87% of fee goes to LPs, 12% to the protocol, 1% to the orca climat fund 

interface WhirlpoolReward {
    mint: string;
    vault: string;
    authority: string;
    emissions_per_second_x64: string;
    growth_global_x64: string;
}
interface Whirlpool {
    address: string;
    whirlpoolsConfig: string;
    whirlpoolBump: number[];
    tickSpacing: number;
    tickSpacingSeed: number[];
    feeRate: number;
    protocolFeeRate: number;
    liquidity: string;
    sqrtPrice: string;
    tickCurrentIndex: number;
    protocolFeeOwedA: string;
    protocolFeeOwedB: string;
    tokenMintA: string;
    tokenVaultA: string;
    feeGrowthGlobalA: string;
    tokenMintB: string;
    tokenVaultB: string;
    feeGrowthGlobalB: string;
    rewardLastUpdatedTimestamp: string;
    updatedAt: string;
    updatedSlot: number;
    writeVersion: number;
    risk: number;
    hasRewards: boolean;
    price: string;
    rewardsUsdc24h: string;
    volumeUsdc24h: string;
    tvlUsdc: string;
    feesUsdc24h: string;
    yieldOverTvl: string;
    rewards: WhirlpoolReward[];
}
interface WhirlpoolWithNumberMetrics extends Omit<Whirlpool, 'rewardsUsdc24h' | 'volumeUsdc24h' | 'tvlUsdc' | 'feesUsdc24h'> {
    rewardsUsdc24h: number;
    volumeUsdc24h: number;
    tvlUsdc: number;
    feesUsdc24h: number;
}
interface StatsApiResponse {
    data: Whirlpool[];
    meta: {
        cursor: {
            previous: string;
            next: string;
        }
    }
}

function convertWhirlpoolMetricsToNumbers(whirlpool: Whirlpool): WhirlpoolWithNumberMetrics {
    return {
        ...whirlpool,
        rewardsUsdc24h: Number(whirlpool.rewardsUsdc24h),
        volumeUsdc24h: Number(whirlpool.volumeUsdc24h),
        tvlUsdc: Number(whirlpool.tvlUsdc),
        feesUsdc24h: Number(whirlpool.feesUsdc24h),
    };
};

function calculateLPFees(pool: WhirlpoolWithNumberMetrics): number {
    const actualFeeRate = pool.feeRate / FEE_RATE_DENOMINATOR;
    if (actualFeeRate >= FEE_RATE_THRESHOLD) {
        return pool.feesUsdc24h * .87; 
    }
    return pool.feesUsdc24h;
}

function calculateProtocolFees(pool: WhirlpoolWithNumberMetrics): number {
    const actualFeeRate = pool.feeRate / FEE_RATE_DENOMINATOR;
    if (actualFeeRate >= FEE_RATE_THRESHOLD) {
        return pool.feesUsdc24h * PROTOCOL_FEE_RATE; 
    }
    return 0;
}

async function fetch(timestamp: number, url: string) {
    let allWhirlpools: Whirlpool[] = [];
    let nextCursor: string | null = null;
    let page = 0;

    do {
        page++;
        const currentUrl = nextCursor ? `${url}?after=${nextCursor}` : url;
        const response: StatsApiResponse = await httpGet(currentUrl);
        allWhirlpools = allWhirlpools.concat(response.data);
        nextCursor = response.meta?.cursor?.next || null;
    } while (nextCursor);
    const allPools = allWhirlpools.map(convertWhirlpoolMetricsToNumbers);
    const validPools = allPools.filter((pool) => ((pool.tvlUsdc > 10_000) || (pool.feeRate > 1000)));
    console.log(`total pages: ${page} and valid pools: ${validPools.length} and all pools: ${allPools.length}`);

    const dailyVolume = validPools.reduce(
        (sum: number, pool: any) => sum + (pool?.volumeUsdc24h || 0), 0
    );

    const dailyLpFees = validPools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateLPFees(pool), 0
    );

    const dailyFees = validPools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + pool.feesUsdc24h, 0
    )

    const dailyRevenue = allPools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateProtocolFees(pool), 0
    );

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees, // All fees paid by users
        dailySupplySideRevenue: dailyLpFees, // Revenue earned by LPs
        dailyProtocolRevenue: dailyRevenue, // Revenue going to protocol treasury
        dailyRevenue, // Total protocol revenue (same as protocol revenue in this case)
        timestamp: timestamp
    }
}

async function fetchSolana(timestamp: number) {
    return await fetch(timestamp, statsApiEndpoint);
}

async function fetchEclipse(timestamp: number) {
    return await fetch(timestamp, eclipseStatsApiEndpoint);
}

export default {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetchSolana,
            runAtCurrTime: true,
            start: '2022-09-14',
        },
        [CHAIN.ECLIPSE]: {
            fetch: fetchEclipse,
            runAtCurrTime: true,
            start: '2022-09-14',
        }
    }
}
