/// Project URL: https://voodoo.trade
/// Contact: chickenjuju@proton.me
///
/// Voodoo Trade is the ultimate FTM-focused perpetual DEX on Fantom Network.
/// Voodoo caters solely to FTM/stable pairs, offering the deepest liquidity and most competitive
/// margin fees available, on par with CEX rates. LPs can earn real yield from both margin trades
/// and swaps on Fantom’s most highly traded pair, with no need to hold any tokens besides FTM
/// and stables. Voodoo is a fair launch platform with support from an array of Fantom Ecosystem
/// stakeholders, and implements a long-term oriented tokenomics system that is the first of its
/// kind for perpetual DEXs.

import request, { gql } from "graphql-request";
import { BreakdownAdapter, DISABLED_ADAPTER_KEY, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/chicken-juju/voodoo-fantom-stats",
}

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        swap
      }
  }
`;

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        liquidation
        margin
      }
  }
`;

interface IGraphResponse {
  volumeStats: Array<{
    burn: string,
    liquidation: string,
    margin: string,
    mint: string,
    swap: string,
  }>
}

const getFetch = (query: string) => (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)));
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: String(dayTimestamp) + ":daily",
    period: "daily",
  });
  const totalData: IGraphResponse = await request(endpoints[chain], query, {
    id: "total",
    period: "total",
  });

  return {
    timestamp: dayTimestamp,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : '0',
    totalVolume:
      totalData.volumeStats.length == 1
        ? String(Number(Object.values(totalData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,
  }
}

const getStartTimestamp = async (chain: string) => {
  const startTimestamps: { [chain: string]: number } = {
    [CHAIN.FANTOM]: 1686971650,
  }
  return startTimestamps[chain]
}

const adapter: BreakdownAdapter = {
  breakdown: {
    "swap": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        [DISABLED_ADAPTER_KEY]: disabledAdapter,
        ...acc,
        [chain]: disabledAdapter
      }
    }, {}),
    "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        [DISABLED_ADAPTER_KEY]: disabledAdapter,
        ...acc,
        [chain]: disabledAdapter
      }
    }, {})
  }
}

export default adapter;
