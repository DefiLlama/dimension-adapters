import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

const endpoints: { [key: string]: string } = {
    [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/navid-fkh/symmetrical_bsc",
    // [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/navid-fkh/symmetrical_fantom",
    // [CHAIN.BASE]: "https://api.thegraph.com/subgraphs/name/navid-fkh/symmetrical_base",
}


const query = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(where: {timestamp_gte: $from, timestamp_lte: $to}){
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
  }
`


interface IGraphResponse {
    dailyHistories: Array<{
        tiemstamp: string,
        platformFee: string,
        accountSource: string,
        tradeVolume: string
    }>
    totalHistories: Array<{
        tiemstamp: string,
        platformFee: string,
        accountSource: string,
        tradeVolume: BigNumber
    }>
}

const check = (x: BigNumber) => {
    if (x.isEqualTo(0)) return undefined
    return x
}

const getFeesFetch = (chain: string) => async (timestamp: number) => {
    const response: IGraphResponse = await request(endpoints[chain], query, {
        from: String(timestamp - ONE_DAY_IN_SECONDS),
        to: String(timestamp)
    })


    let dailyVolume = new BigNumber(0);
    response.dailyHistories.forEach(data => {
        dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume))
    });

    let totalVolume = new BigNumber(0);
    response.totalHistories.forEach(data => {
        totalVolume = totalVolume.plus(new BigNumber(data.tradeVolume))
    });

    dailyVolume = dailyVolume.dividedBy(new BigNumber(1e18))
    totalVolume = totalVolume.dividedBy(new BigNumber(1e18))

    const _dailyVolume = check(dailyVolume)
    const _totalVolume = check(totalVolume)

    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))

    return {
        timestamp: dayTimestamp,
        dailyVolume: _dailyVolume,
        totalVolume: _totalVolume,
    }
}

const getDerivativesFetch = (chain: string) => async (timestamp: number) => {
    const response: IGraphResponse = await request(endpoints[chain], query, {
        from: String(timestamp - ONE_DAY_IN_SECONDS),
        to: String(timestamp)
    })


    let dailyFees = new BigNumber(0);
    response.dailyHistories.forEach(data => {
        dailyFees = dailyFees.plus(new BigNumber(data.platformFee))
    });

    let totalFees = new BigNumber(0);
    response.totalHistories.forEach(data => {
        totalFees = totalFees.plus(new BigNumber(data.platformFee))
    });

    dailyFees = dailyFees.dividedBy(new BigNumber(1e18))
    totalFees = totalFees.dividedBy(new BigNumber(1e18))

    const _dailyFees = check(dailyFees)
    const _totalFees = check(totalFees)

    const dailyUserFees = _dailyFees;
    const dailyRevenue = _dailyFees;
    const dailyProtocolRevenue = 0;
    const dailyHoldersRevenue = _dailyFees;
    const dailySupplySideRevenue = 0;

    const totalUserFees = _totalFees;
    const totalRevenue = _totalFees;
    const totalProtocolRevenue = 0;
    const totalSupplySideRevenue = 0;
    const totalDailyHoldersRevenue = _totalFees;

    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))

    return {
        timestamp: dayTimestamp,

        dailyFees: _dailyFees,
        totalFees: _totalFees,

        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
        totalUserFees,
        totalRevenue,
        totalProtocolRevenue,
        totalSupplySideRevenue,
        totalDailyHoldersRevenue,
    }
}

const getStartTimestamp = async (chain: string) => {
    const startTimestamps: { [chain: string]: number } = {
        [CHAIN.BSC]: 1687880277,
        [CHAIN.FANTOM]: 1679081473,
        [CHAIN.BASE]: 1691332847,
    }
    return startTimestamps[chain]
}

const adapter: BreakdownAdapter = {
    breakdown: {
        "fees": Object.keys(endpoints).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: getFeesFetch(chain),
                    start: async () => getStartTimestamp(chain)
                }
            }
        }, {}),
        "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: getDerivativesFetch(chain),
                    start: async () => getStartTimestamp(chain)
                }
            }
        }, {}),

    }
}

export default adapter;
