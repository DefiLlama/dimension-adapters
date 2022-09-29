import { FeeAdapter } from "../../adapters.type";
import { OPTIMISM, ARBITRUM, ETHEREUM, POLYGON } from "@defillama/adapters/volumes/helper/chains";
import { request, gql } from "graphql-request";
import { Chain } from "../../utils/constants";
import { getTimestampAtStartOfPreviousDayUTC, getTimestampAtStartOfDayUTC } from "../../utils/date";
import { BorrowFee, BorrowFeeQuery, BorrowResult, ChainMultiEndpoints, CoreFee, CoreFeeQuery, CoreResult, veANGLEQuery } from "./types";

const endpoints = {
    [ETHEREUM]:
    {
        "CORE": "https://api.thegraph.com/subgraphs/name/picodes/transaction",
        "VEANGLE": "https://api.thegraph.com/subgraphs/name/picodes/periphery",
        "BORROW": "https://api.thegraph.com/subgraphs/name/picodes/borrow",
    },
    [OPTIMISM]:
    {
        "BORROW": "https://api.thegraph.com/subgraphs/name/picodes/optimism-borrow",
    },
    [ARBITRUM]:
    {
        "BORROW": "https://api.thegraph.com/subgraphs/name/picodes/arbitrum-borrow",
    },
    [POLYGON]:
    {
        "BORROW": "https://api.thegraph.com/subgraphs/name/picodes/polygon-borrow",
    },
};

const BASE_TOKENS = 1e18;
const DAY = 3600 * 24;
const BORROW_FEE_NAMES = ['surplusFromBorrowFees', 'surplusFromInterests', 'surplusFromLiquidationSurcharges', 'surplusFromRepayFees'];
const CORE_FEE_NAMES = ['totalProtocolFees', 'totalProtocolInterests', 'totalSLPFees', 'totalSLPInterests', 'totalKeeperFees'];
const CORE_PROTOCOL_FEE_NAMES = ['totalProtocolFees', 'totalProtocolInterests'];

const CORE_QUERY = gql
    `
  query Query ($today: BigInt!, $yesterday: BigInt!) {
    today : feeHistoricalDatas (where: {timestamp_lt: $today }, first: 1, orderBy: timestamp, orderDirection: desc)  {
        totalProtocolFees
        totalSLPFees
        totalKeeperFees
        totalProtocolInterests
        totalSLPInterests
        blockNumber
        timestamp
    }
    yesterday : feeHistoricalDatas (where: {timestamp_lt: $yesterday }, first: 1, orderBy: timestamp, orderDirection: desc)  {
        totalProtocolFees
        totalSLPFees
        totalKeeperFees
        totalProtocolInterests
        totalSLPInterests
        blockNumber
        timestamp
    }
  }
`;

const BORROW_QUERY = gql
    `
  query Query ($today: BigInt!, $yesterday: BigInt!) {
    today : feeHistoricalDatas (where: {timestamp_lt: $today }, first: 1, orderBy: timestamp, orderDirection: desc)  {
      surplusFromInterests
      surplusFromBorrowFees
      surplusFromRepayFees
      surplusFromLiquidationSurcharges
      blockNumber
      timestamp
    }
    yesterday : feeHistoricalDatas (where: {timestamp_lt: $yesterday }, first: 1, orderBy: timestamp, orderDirection: desc)  {
      surplusFromInterests
      surplusFromBorrowFees
      surplusFromRepayFees
      surplusFromLiquidationSurcharges
      blockNumber
      timestamp
    }
  }
`;

const VEANGLE_QUERY = gql
    `
  query Query {
    feeDistributions {
      tokenDecimals
      tokenName
      token
      tokensPerWeek {
        week
        distributed
      }
    }
  }
`;

const getCoreFees = async (graphUrl: string, todayTimestamp: number, yesterdayTimestamp: number): Promise<CoreResult> => {
    const queryCoreFees = await request(graphUrl, CORE_QUERY, {
        today: todayTimestamp,
        yesterday: yesterdayTimestamp
    }) as CoreFeeQuery;

    let processedFees = { today: {} as CoreFee, yesterday: {} as CoreFee };
    processedFees.today.timestamp = queryCoreFees.today[0].timestamp
    processedFees.yesterday.timestamp = queryCoreFees.yesterday[0].timestamp
    processedFees.today.blockNumber = queryCoreFees.today[0].blockNumber
    CORE_FEE_NAMES.forEach((key,) => {
        processedFees.today[key as keyof CoreFee] = queryCoreFees.today[0][key as keyof CoreFee] / BASE_TOKENS
        processedFees.yesterday[key as keyof CoreFee] = queryCoreFees.yesterday[0][key as keyof CoreFee] / BASE_TOKENS
    });

    const noNewDataPoint = processedFees.today.timestamp === processedFees.yesterday.timestamp;
    const normalizer = (processedFees.today.timestamp - processedFees.yesterday.timestamp) / DAY;
    const deltaCoreFees = {
        totalProtocolFees: noNewDataPoint ? 0 : (processedFees.today.totalProtocolFees - processedFees.yesterday.totalProtocolFees) / normalizer,
        totalKeeperFees: noNewDataPoint ? 0 : (processedFees.today.totalKeeperFees - processedFees.yesterday.totalKeeperFees) / normalizer,
        totalSLPFees: noNewDataPoint ? 0 : (processedFees.today.totalSLPFees - processedFees.yesterday.totalSLPFees) / normalizer,
        totalProtocolInterests: noNewDataPoint ? 0 : (processedFees.today.totalProtocolInterests - processedFees.yesterday.totalProtocolInterests) / normalizer,
        totalSLPInterests: noNewDataPoint ? 0 : (processedFees.today.totalSLPInterests - processedFees.yesterday.totalSLPInterests) / normalizer,
        timestamp: noNewDataPoint ? 0 : processedFees.today.timestamp,
        blockNumber: noNewDataPoint ? 0 : processedFees.today.blockNumber,
    }
    return { totalFees: processedFees.today, deltaFees: deltaCoreFees };
};

const getBorrowFees = async (graphUrl: string, todayTimestamp: number, yesterdayTimestamp: number): Promise<BorrowResult> => {
    const queryBorrowFees = await request(graphUrl, BORROW_QUERY, {
        today: todayTimestamp,
        yesterday: yesterdayTimestamp
    }) as BorrowFeeQuery;

    let processedFees = { today: {} as BorrowFee, yesterday: {} as BorrowFee };
    processedFees.today.timestamp = queryBorrowFees.today[0].timestamp
    processedFees.yesterday.timestamp = queryBorrowFees.yesterday[0].timestamp
    processedFees.today.blockNumber = queryBorrowFees.today[0].blockNumber
    BORROW_FEE_NAMES.forEach((key,) => {
        processedFees.today[key as keyof BorrowFee] = queryBorrowFees.today[0][key as keyof BorrowFee] / BASE_TOKENS
        processedFees.yesterday[key as keyof BorrowFee] = queryBorrowFees.yesterday[0][key as keyof BorrowFee] / BASE_TOKENS
    });

    const noNewDataPoint = processedFees.today.timestamp === processedFees.yesterday.timestamp;
    const normalizer = (processedFees.today.timestamp - processedFees.yesterday.timestamp) / DAY;
    const deltaBorrowFees = {
        surplusFromInterests: noNewDataPoint ? 0 : (processedFees.today.surplusFromInterests - processedFees.yesterday.surplusFromInterests) / normalizer,
        surplusFromBorrowFees: noNewDataPoint ? 0 : (processedFees.today.surplusFromBorrowFees - processedFees.yesterday.surplusFromBorrowFees) / normalizer,
        surplusFromRepayFees: noNewDataPoint ? 0 : (processedFees.today.surplusFromRepayFees - processedFees.yesterday.surplusFromRepayFees) / normalizer,
        surplusFromLiquidationSurcharges: noNewDataPoint ? 0 : (processedFees.today.surplusFromLiquidationSurcharges - processedFees.yesterday.surplusFromLiquidationSurcharges) / normalizer,
        timestamp: processedFees.today.timestamp,
        blockNumber: processedFees.today.blockNumber,
    }
    return { totalFees: processedFees.today, deltaFees: deltaBorrowFees };
};

// They are only distributed each week so doesn't make sense to log a window period of 1 day, instead normalize the amount by 7
const getVEANGLERevenues = async (graphUrl: string, todayTimestamp: number): Promise<{ totalInterest: number, deltaInterest: number }> => {
    const getFeeDistribution = await request(graphUrl, VEANGLE_QUERY, {}) as veANGLEQuery;

    const queryYesterdayTimestamp = Math.floor(todayTimestamp / (DAY * 7)) * (DAY * 7);
    const queryTodayTimestamp = Math.ceil(todayTimestamp / (DAY * 7)) * (DAY * 7);

    let deltaDistributedInterest = getFeeDistribution.feeDistributions.reduce<number>((acc, feeDistributor) => {
        return (
            acc +
            feeDistributor.tokensPerWeek
                .filter((weeklyReward) => (weeklyReward.week <= queryTodayTimestamp && weeklyReward.week >= queryYesterdayTimestamp))
                .reduce<number>((acc, weeklyReward) => {
                    return acc + weeklyReward.distributed / 10 ** getFeeDistribution.feeDistributions[0].tokenDecimals;
                }, 0)
        );
    }, 0);

    deltaDistributedInterest /= 7;

    const totalDistributedInterest = getFeeDistribution.feeDistributions.reduce<number>((acc, feeDistributor) => {
        return (
            acc +
            feeDistributor.tokensPerWeek
                .filter((weeklyReward) => weeklyReward.week <= todayTimestamp)
                .reduce<number>((acc, weeklyReward) => {
                    return acc + weeklyReward.distributed / 10 ** getFeeDistribution.feeDistributions[0].tokenDecimals;
                }, 0)
        );
    }, 0);

    return { totalInterest: totalDistributedInterest, deltaInterest: deltaDistributedInterest };
};

function aggregateFee(
    key: string,
    coreFees: { totalFees: CoreFee, deltaFees: CoreFee },
    borrowFees: {
        totalFees: BorrowFee;
        deltaFees: BorrowFee;
    }
): { totalRevenue: number, totalFees: number } {
    const borrowTotalRevenue = BORROW_FEE_NAMES.reduce((acc, name) => {
        return (name in borrowFees[key as keyof BorrowResult]) ? acc + borrowFees[key as keyof BorrowResult][name as keyof BorrowFee] : acc;
    }, 0);
    const coreTotalRevenue = CORE_PROTOCOL_FEE_NAMES.reduce((acc, name) => {
        return (name in coreFees[key as keyof CoreResult]) ? acc + coreFees[key as keyof CoreResult][name as keyof CoreFee] : acc;
    }, 0);
    const coreTotalFees = CORE_FEE_NAMES.reduce((acc, name) => {
        return (name in coreFees[key as keyof CoreResult]) ? acc + coreFees[key as keyof CoreResult][name as keyof CoreFee] : acc;
    }, 0);

    let totalRevenue = borrowTotalRevenue + coreTotalRevenue;
    let totalFees = borrowTotalRevenue + coreTotalFees;

    return { totalRevenue: totalRevenue, totalFees: totalFees };
}


const graph = (graphUrls: ChainMultiEndpoints) => {
    return (chain: Chain) => {
        return async (timestamp: number) => {

            const todayTimestamp = getTimestampAtStartOfDayUTC(timestamp)
            const yesterdayTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)

            let coreFees: CoreResult = { totalFees: {} as CoreFee, deltaFees: {} as CoreFee };
            let veANGLEInterest = { totalInterest: 0, deltaInterest: 0 };
            const borrowFees = await getBorrowFees(graphUrls[chain].BORROW, todayTimestamp, yesterdayTimestamp);
            if (chain == "ethereum") {
                coreFees = await getCoreFees(graphUrls[chain].CORE, todayTimestamp, yesterdayTimestamp);
                veANGLEInterest = await getVEANGLERevenues(graphUrls[chain].VEANGLE, todayTimestamp);
            }

            const total = aggregateFee("totalFees", coreFees, borrowFees);
            const daily = aggregateFee("deltaFees", coreFees, borrowFees);

            return {
                timestamp,
                totalFees: (total.totalFees + veANGLEInterest.totalInterest).toString(),
                dailyFees: (daily.totalFees + veANGLEInterest.deltaInterest).toString(),
                totalRevenue: (total.totalRevenue + veANGLEInterest.totalInterest).toString(),
                dailyRevenue: (daily.totalRevenue + veANGLEInterest.deltaInterest).toString(),
            };
        }
    }
};

const adapter: FeeAdapter = {
    fees: {
        [ETHEREUM]: {
            fetch: graph(endpoints)(ETHEREUM),
            start: 1636046347,
        },
        [OPTIMISM]: {
            fetch: graph(endpoints)(OPTIMISM),
            start: 1657041547,
        },
        [ARBITRUM]: {
            fetch: graph(endpoints)(ARBITRUM),
            start: 1657041547,
        },
        [POLYGON]: {
            fetch: graph(endpoints)(POLYGON),
            start: 1656782347,
        },
    }
}

export default adapter;
