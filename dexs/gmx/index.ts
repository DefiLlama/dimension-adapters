import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-arbitrum-stats/api",
  [CHAIN.AVAX]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-avalanche-stats/api",
}

const HACK_TIMESTAMP = 1752019200;

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        swap
      }
  }
`

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        liquidation
        margin
      }
  }
`
const historicalOI = gql`
  query get_trade_stats($period: String!, $id: String!) {
    tradingStats(where: {period: $period, id: $id}) {
      id
      longOpenInterest
      shortOpenInterest
    }
  }
`

interface IGraphResponse {
  volumeStats: Array<{
    burn: string,
    liquidation: string,
    margin: string,
    mint: string,
    swap: string,
  }>
}
interface IGraphResponseOI {
  tradingStats: Array<{
    id: string,
    longOpenInterest: string,
    shortOpenInterest: string,
  }>
}

const getFetch = (query: string)=> (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: chain === CHAIN.ARBITRUM
      ? String(dayTimestamp)
      : String(dayTimestamp) + ':daily',
    period: 'daily',
  })

  let openInterestAtEnd = 0;
  let longOpenInterestAtEnd = 0;
  let shortOpenInterestAtEnd = 0;

  if (query === historicalDataDerivatives) {
    const tradingStats: IGraphResponseOI = await request(endpoints[chain], historicalOI, {
      id: chain === CHAIN.ARBITRUM
      ? String(dayTimestamp)
      : String(dayTimestamp) + ':daily',
      period: 'daily',
    });
    openInterestAtEnd = tradingStats.tradingStats[0] ? Number(tradingStats.tradingStats[0].longOpenInterest) + Number(tradingStats.tradingStats[0].shortOpenInterest) : 0;
    longOpenInterestAtEnd = tradingStats.tradingStats[0] ? Number(tradingStats.tradingStats[0].longOpenInterest) : 0;
    shortOpenInterestAtEnd = tradingStats.tradingStats[0] ? Number(tradingStats.tradingStats[0].shortOpenInterest) : 0;
  }
  if (dayTimestamp == HACK_TIMESTAMP && chain == CHAIN.ARBITRUM){
    return {
      longOpenInterestAtEnd: longOpenInterestAtEnd ? String(longOpenInterestAtEnd * 10 ** -30) : undefined,
      shortOpenInterestAtEnd: shortOpenInterestAtEnd ? String(shortOpenInterestAtEnd * 10 ** -30) : undefined,
      openInterestAtEnd: openInterestAtEnd ? String(openInterestAtEnd * 10 ** -30) : undefined,
      dailyVolume: '0',
    }
  }

  return {
    longOpenInterestAtEnd: longOpenInterestAtEnd ? String(longOpenInterestAtEnd * 10 ** -30) : undefined,
    shortOpenInterestAtEnd: shortOpenInterestAtEnd ? String(shortOpenInterestAtEnd * 10 ** -30) : undefined,
    openInterestAtEnd: openInterestAtEnd ? String(openInterestAtEnd * 10 ** -30) : undefined,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : 0
  }
}


const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1630368000,
  [CHAIN.AVAX]: 1640131200,
}

const adapter: BreakdownAdapter = {
  breakdown: {
    "swap": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataSwap)(chain),
          start: startTimestamps[chain]
        }
      }
    }, {}),
    "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataDerivatives)(chain),
          start: startTimestamps[chain]
        }
      }
    }, {})
  }
}

export default adapter;
