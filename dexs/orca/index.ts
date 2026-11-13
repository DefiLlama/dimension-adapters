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
// 10% of the 12% treasury share buys ORCA for the xORCA vault from 30 Oct 2026, after the October
// 2026 tokenholder vote (40% from 13 Jan 2026, 20% before).
// https://forums.orca.so/t/council-update-increased-xorca-buyback-rewards-fueled-by-protocol-fee-revenue-20-to-40-and-r-d-grant/1129
// https://forums.orca.so/t/tokenholder-proposal-resourcing-orca-for-its-next-phase/1281
const HOLDERS_REVENUE_RATE = 0.10;
// The Team-managed Buyback Account gets another 10% of the treasury share. The account is
// Team-controlled and the ORCA it buys can go to locked contributor grants as well as burns or
// xORCA deposits, so it stays in protocol revenue rather than holders revenue.
const BUYBACK_ACCOUNT_RATE = 0.10;
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

// Buybacks are funded from the treasury share only, so the climate donation comes off first.
function calculateTreasuryShare(pool: WhirlpoolWithNumberMetrics): number {
    return pool.feesUsdc24h * (protocolFeeShare(pool) - CLIMATE_FUND_RATE);
}

function calculateHoldersRevenue(pool: WhirlpoolWithNumberMetrics): number {
    return calculateTreasuryShare(pool) * HOLDERS_REVENUE_RATE;
}

function calculateBuybackAccountRevenue(pool: WhirlpoolWithNumberMetrics): number {
    return calculateTreasuryShare(pool) * BUYBACK_ACCOUNT_RATE;
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
        // 1000 pools per request (the API maximum) instead of the default 50: same pools, same order, same cursors
        const currentUrl = nextCursor ? `${url}?limit=1000&after=${nextCursor}` : `${url}?limit=1000`;
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
            await delay(100);
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

    const lpFees = validFeePools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateLPFees(pool), 0
    );

    const swapFees = validFeePools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + pool.feesUsdc24h, 0
    )

    const protocolFees = validFeePools.reduce(
        (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateProtocolFees(pool), 0
    );

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addUSDValue(swapFees, 'Swap Fees');
    dailySupplySideRevenue.addUSDValue(lpFees, 'Swap Fees To LPs');

    if (options.chain == CHAIN.SOLANA) {
        const buybackFees = validFeePools.reduce(
            (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateHoldersRevenue(pool), 0
        );
        const buybackAccountFees = validFeePools.reduce(
            (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + calculateBuybackAccountRevenue(pool), 0
        );
        const climateFundFees = validFeePools.reduce(
            (sum: number, pool: WhirlpoolWithNumberMetrics) => sum + pool.feesUsdc24h * CLIMATE_FUND_RATE, 0
        );
        const treasuryFees = protocolFees - buybackFees - buybackAccountFees - climateFundFees;
        dailyRevenue.addUSDValue(treasuryFees, 'Treasury');
        dailyRevenue.addUSDValue(buybackFees, 'xORCA Buyback');
        dailyRevenue.addUSDValue(buybackAccountFees, 'Buyback Account');
        dailyRevenue.addUSDValue(climateFundFees, 'Climate Fund Donation');
        dailyProtocolRevenue.addUSDValue(treasuryFees, 'Treasury');
        dailyProtocolRevenue.addUSDValue(buybackAccountFees, 'Buyback Account');
        dailyProtocolRevenue.addUSDValue(climateFundFees, 'Climate Fund Donation');
        dailyHoldersRevenue.addUSDValue(buybackFees, 'xORCA Buyback');
    } else {
        dailyRevenue.addUSDValue(protocolFees, 'Treasury');
        dailyProtocolRevenue.addUSDValue(protocolFees, 'Treasury');
    }

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Volume: "Total swap volume across all Orca Whirlpools.",
    Fees: "All swap fees paid by traders, including the volatility surcharge on adaptive-fee pools.",
    UserFees: "All swap fees paid by traders.",
    Revenue: "The 13% of swap fees Orca takes on every pool. Of the total fees, 12% is the treasury share and 1% is donated to the Orca Climate Fund.",
    ProtocolRevenue: "The treasury share not sent to xORCA: the Team's 80% and the Buyback Account's 10% of the 12%, plus the 1% Climate Fund donation (11.8% of swap fees).",
    SupplySideRevenue: "The 87% of swap fees that accrues to liquidity providers.",
    HoldersRevenue: "10% of the 12% treasury share (1.2% of swap fees), used to buy ORCA and deposit it into the xORCA vault. 10% from 30 October 2026 after the October 2026 tokenholder vote, 40% from 13 January 2026, 20% before."
}

const breakdownMethodology = {
    Fees: {
        'Swap Fees': "All swap fees paid by traders, including the volatility surcharge on adaptive-fee pools.",
    },
    UserFees: {
        'Swap Fees': "All swap fees paid by traders.",
    },
    Revenue: {
        'Treasury': "The Team's 80% of the 12% treasury share (9.6% of swap fees), from 30 October 2026 after the October 2026 tokenholder vote.",
        'xORCA Buyback': "10% of the 12% treasury share (1.2% of swap fees), used to buy ORCA for the xORCA vault. 10% from 30 October 2026 after the October 2026 tokenholder vote, 40% from 13 January 2026, 20% before.",
        'Buyback Account': "10% of the 12% treasury share (1.2% of swap fees) sent to the Team-managed Buyback Account for discretionary ORCA buybacks; bought ORCA may be burned, deposited into xORCA or used for locked contributor grants.",
        'Climate Fund Donation': "1% of swap fees donated to the Orca Climate Fund.",
    },
    ProtocolRevenue: {
        'Treasury': "The Team's 80% of the 12% treasury share (9.6% of swap fees), from 30 October 2026 after the October 2026 tokenholder vote.",
        'Buyback Account': "10% of the 12% treasury share (1.2% of swap fees) sent to the Team-managed Buyback Account for discretionary ORCA buybacks; bought ORCA may be burned, deposited into xORCA or used for locked contributor grants.",
        'Climate Fund Donation': "1% of swap fees donated to the Orca Climate Fund.",
    },
    HoldersRevenue: {
        'xORCA Buyback': "10% of the 12% treasury share (1.2% of swap fees), used to buy ORCA for the xORCA vault. 10% from 30 October 2026 after the October 2026 tokenholder vote, 40% from 13 January 2026, 20% before.",
    },
    SupplySideRevenue: {
        'Swap Fees To LPs': "The 87% of swap fees that accrues to liquidity providers.",
    },
}

export default {
    methodology,
    breakdownMethodology,
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
