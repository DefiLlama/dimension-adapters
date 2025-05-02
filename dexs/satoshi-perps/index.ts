import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/satoshi-perps-mainnet-stats-f0aca40abf13e5b5",
}


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
    id: String(dayTimestamp) + ':daily',
    period: 'daily',
  })
  const totalData: IGraphResponse = await request(endpoints[chain], query, {
    id: 'total',
    period: 'total',
  })
  let dailyOpenInterest = 0;
  let dailyLongOpenInterest = 0;
  let dailyShortOpenInterest = 0;

  if (query === historicalDataDerivatives) {
    const tradingStats: IGraphResponseOI = await request(endpoints[chain], historicalOI, {
      id: String(dayTimestamp),
      period: 'daily',
    });
    dailyOpenInterest = Number(tradingStats.tradingStats[0].longOpenInterest) + Number(tradingStats.tradingStats[0].shortOpenInterest);
    dailyLongOpenInterest = Number(tradingStats.tradingStats[0].longOpenInterest);
    dailyShortOpenInterest = Number(tradingStats.tradingStats[0].shortOpenInterest);
  }

  return {
    timestamp: dayTimestamp,
    dailyLongOpenInterest: dailyLongOpenInterest ? String(dailyLongOpenInterest * 10 ** -30) : undefined,
    dailyShortOpenInterest: dailyShortOpenInterest ? String(dailyShortOpenInterest * 10 ** -30) : undefined,
    dailyOpenInterest: dailyOpenInterest ? String(dailyOpenInterest * 10 ** -30) : undefined,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,
    totalVolume:
      totalData.volumeStats.length == 1
        ? String(Number(Object.values(totalData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,

  }
}


const startTimestamps: { [chain: string]: number } = {
  [CHAIN.CORE]: 1734914400,
}
const adapter: BreakdownAdapter = {
  breakdown: {
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
