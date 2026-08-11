import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import asyncRetry from "async-retry";
import { FetchOptions } from '../../adapters/types';

const statsApiEndpoint = "https://stats-api.mainnet.orca.so/api/whirlpools";
const eclipseStatsApiEndpoint = "https://stats-api-eclipse.mainnet.orca.so/api/whirlpools";
// Whirlpool.protocolFeeRate is basis points of the swap fee (PROTOCOL_FEE_RATE_MUL_VALUE = 10_000
// in the on-chain program), currently 1300 = 13% on every pool. The remaining 87% accrues to LPs.
const PROTOCOL_FEE_RATE_DENOMINATOR = 10_000;
// Of the 13% the protocol takes, 1 point of gross fees is donated to the Orca Climate Fund and the
// other 12 points are the treasury share. There is no separate on-chain climate account — the
// donation is made downstream out of collected protocol fees, so it stays inside revenue.
const CLIMATE_FUND_RATE = 0.01;
// 40% of the 12% treasury share buys ORCA for the xORCA vault (raised from 20% on 13 Jan 2026).
// https://forums.orca.so/t/council-update-increased-xorca-buyback-rewards-fueled-by-protocol-fee-revenue-20-to-40-and-r-d-grant/1129
const HOLDERS_REVENUE_RATE = 0.40;
// FEE_RATE_HARD_LIMIT in the on-chain program caps the total swap fee (static + adaptive) at 10%,
// so anything above that is bad data rather than an expensive pool.
const MAX_FEE_TIER = 10 / 100;
const FEE_TIER_EPSILON = 1e-4; // tolerance for rounding (e.g. 2.00002% vs 2%)

const CONFIG: any = {
    [CHAIN.SOLANA]: {
        url: statsApiEndpoint,
        blacklistedPools: [
            'EhNTpT8mAi2M9RcKkyEQLh9t9EbhyNKEcnsPAM6qCYEQ', // bad pool very low liquidity
            '7NYhunVC9ASsrwvEC2hPTEzeZAFC5PDjDnS4M3qkY7Mw', // no liquidity(1.8E19 BTC per WBTC)
        ],
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

// Share of a pool's swap fees taken by the protocol, read per pool rather than hardcoded.
function protocolFeeShare(pool: WhirlpoolWithNumberMetrics): number {
    return pool.protocolFeeRate / PROTOCOL_FEE_RATE_DENOMINATOR;
}

function calculateLPFees(pool: WhirlpoolWithNumberMetrics): number {
    return pool.feesUsdc24h * (1 - protocolFeeShare(pool));
}

function calculateProtocolFees(pool: WhirlpoolWithNumberMetrics): number {
    return pool.feesUsdc24h * protocolFeeShare(pool);
}

// The buyback is funded from the treasury share only, so the climate donation comes off first.
function calculateHoldersRevenue(pool: WhirlpoolWithNumberMetrics): number {
    const treasuryFees = pool.feesUsdc24h * (protocolFeeShare(pool) - CLIMATE_FUND_RATE);
    return treasuryFees * HOLDERS_REVENUE_RATE;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetch(options: FetchOptions) {
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
        options.api.log(`page: ${page} and nextCursor: ${nextCursor}`);
    } while (nextCursor);
    const allPools = allWhirlpools.map(convertWhirlpoolMetricsToNumbers);
    // A realized fee rate above the on-chain hard limit can only be bad data, so those pools are
    // dropped from volume as well as fees instead of counting on one side of the ratio only.
    const plausibleFeeRate = (pool: WhirlpoolWithNumberMetrics) =>
        !(pool.volumeUsdc24h && pool.feesUsdc24h) || (pool.feesUsdc24h / pool.volumeUsdc24h <= MAX_FEE_TIER + FEE_TIER_EPSILON);
    let validPools = allPools.filter((pool) => ((pool.tvlUsdc > 10_000) || (pool.feeRate > 1000)) && plausibleFeeRate(pool));
    let validFeePools = validPools.filter((pool) => (pool.volumeUsdc24h && pool.feesUsdc24h));

    if (CONFIG[options.chain].blacklistedPools) {
        validPools = validPools.filter(p => !CONFIG[options.chain].blacklistedPools.includes(p.address))
        validFeePools = validFeePools.filter(p => !CONFIG[options.chain].blacklistedPools.includes(p.address))
    }

    options.api.log(`total pages: ${page} and valid pools: ${validPools.length} and all pools: ${allPools.length}`);

    const dailyVolume = validPools.reduce(
        (sum: number, pool: any) => sum + (pool?.volumeUsdc24h || 0), 0
    );

    const dailyLpFees = validFeePools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateLPFees(pool), 0
    );

    const dailyFees = validFeePools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + pool.feesUsdc24h, 0
    )

    const dailyRevenue = validFeePools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateProtocolFees(pool), 0
    );

    let dailyHoldersRevenue = 0;

    if (options.chain == CHAIN.SOLANA) {
        dailyHoldersRevenue = validFeePools.reduce(
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
    Volume: "Total swap volume across all Orca Whirlpools.",
    Fees: "All swap fees paid by traders, including the volatility surcharge on adaptive-fee pools.",
    UserFees: "All swap fees paid by traders.",
    Revenue: "The 13% of swap fees Orca takes on every pool. Of the total fees, 12% is the treasury share and 1% is donated to the Orca Climate Fund.",
    ProtocolRevenue: "The treasury share left after the xORCA buyback: the initial development team's 50% and the Orca DAO's 10% of the 12%, plus the 1% Climate Fund donation.",
    SupplySideRevenue: "The 87% of swap fees that accrues to liquidity providers.",
    HoldersRevenue: "40% of the 12% treasury share, used to buy ORCA and deposit it into the xORCA vault. Raised from 20% on 13 January 2026."
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
        // [CHAIN.ECLIPSE]: {
        //     fetch,
        //     start: '2022-09-14',
        // }
    },
    isExpensiveAdapter: true,
}
