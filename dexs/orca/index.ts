import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import asyncRetry from "async-retry";
import { FetchOptions } from '../../adapters/types';

const statsApiEndpoint = "https://stats-api.mainnet.orca.so/api/whirlpools";
const eclipseStatsApiEndpoint = "https://stats-api-eclipse.mainnet.orca.so/api/whirlpools";
const FEE_RATE_DENOMINATOR = 1_000_000;
const FEE_RATE_THRESHOLD = 0; // 
const PROTOCOL_FEE_RATE = .12; // 87% of fee goes to LPs, 12% to the protocol, 1% to the orca climate fund 
const HOLDERS_REVENUE_RATE = 0.20; // 20% of protocol fees goes to xORCA holders via buybacks and burns
// Based on governance proposal: https://forums.orca.so/t/tokenholder-proposal-for-xorca-initial-development-team-grant-buybacks-and-burn/882

const CONFIG = {
    [CHAIN.SOLANA]: {
        url: statsApiEndpoint,
    },
    [CHAIN.ECLIPSE]: {
        url: eclipseStatsApiEndpoint,
    }
}

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

function calculateHoldersRevenue(pool: WhirlpoolWithNumberMetrics): number {
    const protocolFees = calculateProtocolFees(pool);
    return protocolFees * HOLDERS_REVENUE_RATE; // 20% of protocol fees for xORCA buybacks and burns
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetch(timestamp: number, _b: any, options: FetchOptions) {
    const url = CONFIG[options.chain].url;
    let allWhirlpools: Whirlpool[] = [];
    let nextCursor: string | null = null;
    let page = 0;

    do {
        page++;
        const currentUrl = nextCursor ? `${url}?after=${nextCursor}` : url;
        const response: StatsApiResponse = await asyncRetry(
            async () => {
                return await httpGet(currentUrl);
            },
            {
                retries: 3,
                minTimeout: 1000,
                maxTimeout: 5000,
                factor: 2,
            }
        );
        allWhirlpools = allWhirlpools.concat(response.data);
        nextCursor = response.meta?.cursor?.next || null;

        // Add delay between requests to prevent rate limiting
        if (nextCursor) {
            await delay(1000);
        }
        console.log(`page: ${page} and nextCursor: ${nextCursor}`);
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

    let dailyHoldersRevenue = 0;

    if (options.chain == CHAIN.SOLANA) {
        dailyHoldersRevenue = allPools.reduce(
            (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateHoldersRevenue(pool), 0
        );
    }

    const dailyProtocolRevenue = dailyRevenue - dailyHoldersRevenue; // Protocol treasury gets 80% of protocol fees

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees, // All fees paid by users
        dailyRevenue, // Total protocol revenue before distribution
        dailyProtocolRevenue: dailyProtocolRevenue, // Revenue going to protocol treasury (80% of protocol fees)
        dailyHoldersRevenue: dailyHoldersRevenue, // Revenue going to xORCA holders (20% of protocol fees)
        dailySupplySideRevenue: dailyLpFees, // Revenue earned by LPs
    }
}

const methodology = {
    Fees: "All fees paid by users",
    Revenue: "Revenue going to protocol treasury",
    ProtocolRevenue: "Revenue going to protocol treasury",
    UserFees: "All fees paid by users",
    SupplySideRevenue: "Revenue earned by LPs (87% of total fees)",
    HoldersRevenue: "20% of protocol fees allocated for xORCA holder buybacks and burns."
}

export default {
    methodology,
    version: 1,
    runAtCurrTime: true,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2022-03-10',
        },
        [CHAIN.ECLIPSE]: {
            fetch,
            start: '2022-09-14',
        }
    },
    isExpensiveAdapter: true,
}
