import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import { BorrowFee, BorrowFeeQuery, BorrowResult, ChainEndpoint, CoreFee, CoreFeeQuery, CoreResult, veANGLEQuery } from "./types";


const commonPrefixTheGraph = "https://api.thegraph.com/subgraphs/name/guillaumenervoxs/angle";

const endpoints: ChainEndpoint = {
    [CHAIN.ARBITRUM]: `${commonPrefixTheGraph}-arbitrum`,
    [CHAIN.AVAX]: `${commonPrefixTheGraph}-avalanche`,
    [CHAIN.ETHEREUM]: `${commonPrefixTheGraph}-ethereum`,
    [CHAIN.OPTIMISM]: `${commonPrefixTheGraph}-optimism`,
    [CHAIN.POLYGON]: `${commonPrefixTheGraph}-polygon`,
};

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
        processedFees.today[key as keyof CoreFee] = Number(queryCoreFees.today[0][key as keyof CoreFee])
        processedFees.yesterday[key as keyof CoreFee] = Number(queryCoreFees.yesterday[0][key as keyof CoreFee])
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

    if (queryBorrowFees.today.length == 0 || queryBorrowFees.yesterday.length == 0) return { totalFees: {} as BorrowFee, deltaFees: {} as BorrowFee };

    let processedFees = { today: {} as BorrowFee, yesterday: {} as BorrowFee };
    processedFees.today.timestamp = queryBorrowFees.today[0].timestamp
    processedFees.yesterday.timestamp = queryBorrowFees.yesterday[0].timestamp
    processedFees.today.blockNumber = queryBorrowFees.today[0].blockNumber
    BORROW_FEE_NAMES.forEach((key,) => {
        processedFees.today[key as keyof BorrowFee] = Number(queryBorrowFees.today[0][key as keyof BorrowFee])
        processedFees.yesterday[key as keyof BorrowFee] = Number(queryBorrowFees.yesterday[0][key as keyof BorrowFee])
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

    let deltaDistributedInterest = getFeeDistribution.feeDistributions?.reduce<number>((acc, feeDistributor) => {
        return (
            acc +
            feeDistributor.tokensPerWeek
                .filter((weeklyReward) => (weeklyReward.week <= queryTodayTimestamp && weeklyReward.week >= queryYesterdayTimestamp))
                .reduce<number>((acc, weeklyReward) => {
                    return acc + Number(weeklyReward.distributed);
                }, 0)
        );
    }, 0);

    deltaDistributedInterest /= 7;

    const totalDistributedInterest = getFeeDistribution.feeDistributions?.reduce<number>((acc, feeDistributor) => {
        return (
            acc +
            feeDistributor.tokensPerWeek
                .filter((weeklyReward) => weeklyReward.week <= todayTimestamp)
                .reduce<number>((acc, weeklyReward) => {
                    return acc + Number(weeklyReward.distributed);
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

    return { totalRevenue: totalRevenue, totalFees };
}


const fetch = async (options: FetchOptions) => {
    const timestamp = options.startOfDay
    const borrowFees = await getBorrowFees(endpoints[options.chain] as string, timestamp, timestamp - DAY);
    const coreFees = await getCoreFees(endpoints[options.chain] as string, timestamp, timestamp - DAY);
    const veANGLEInterest = await getVEANGLERevenues(endpoints[options.chain] as string, timestamp);

    const daily = aggregateFee("deltaFees", coreFees, borrowFees);

    return {
        dailyFees: (daily.totalFees + veANGLEInterest.deltaInterest).toString(),
        dailyRevenue: (daily.totalRevenue + veANGLEInterest.deltaInterest).toString(),
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2023-01-01',
        },
        [CHAIN.AVAX]: {
            fetch,
            start: '2023-01-01',
        },
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2023-01-01',
        },
        [CHAIN.OPTIMISM]: {
            fetch,
            start: '2023-01-01',
        },
        [CHAIN.POLYGON]: {
            fetch,
            start: '2023-01-01',
        },
    },
    version: 2
}

export default adapter;
