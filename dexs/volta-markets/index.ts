import request, { gql } from "graphql-request";
import { Fetch, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const config = {
  [CHAIN.CORE]: {
    start: '2025-06-01',
    endpoint: 'https://thegraph.coredao.org/subgraphs/name/volta-perps-mainnet-stat',
  }
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

const fetch: Fetch = async (timestamp:number, _b:any, options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp)
  const dailyData: IGraphResponse = await request(config[options.chain].endpoint, historicalDataDerivatives, {
    id: String(dayTimestamp) + ':daily',
    period: 'daily',
  })
  const dailyVolume = dailyData.volumeStats.length == 1
  ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
  : 0

  // let openInterestAtEnd = 0;
  // let longOpenInterestAtEnd = 0;
  // let shortOpenInterestAtEnd = 0;

  // const tradingStats: IGraphResponseOI = await request(config[chain].endpoint, historicalOI, {
  //   id: String(dayTimestamp),
  //   period: 'daily',
  // });
  // openInterestAtEnd = Number(tradingStats.tradingStats[0]?.longOpenInterest || 0) + Number(tradingStats.tradingStats[0]?.shortOpenInterest || 0);
  // longOpenInterestAtEnd = Number(tradingStats.tradingStats[0]?.longOpenInterest || 0);
  // shortOpenInterestAtEnd = Number(tradingStats.tradingStats[0]?.shortOpenInterest || 0);
  // longOpenInterestAtEnd: longOpenInterestAtEnd ? String(longOpenInterestAtEnd * 10 ** -30) : undefined,
  // shortOpenInterestAtEnd: shortOpenInterestAtEnd ? String(shortOpenInterestAtEnd * 10 ** -30) : undefined,
  // openInterestAtEnd: openInterestAtEnd ? String(openInterestAtEnd * 10 ** -30) : undefined,

  return {
    dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.keys(config).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: config[chain].start
      }
    }
  }, {})
}

export default adapter;
