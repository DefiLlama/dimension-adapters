import * as sdk from "@defillama/sdk";
/// Project URL: https://voodoo.trade
/// Contact: chickenjuju@proton.me
///
/// Voodoo Trade is the ultimate ETH-focused perpetual DEX on Base.
/// Voodoo caters solely to ETH/stable pairs, offering the deepest liquidity and most competitive
/// margin fees available, on par with CEX rates. LPs can earn real yield from both margin trades
/// and swaps on Base's most highly traded pair, with no need to hold any tokens besides ETH
/// and stables. Voodoo is a fair launch platform with support from an array of Base Ecosystem
/// stakeholders, and implements a long-term oriented tokenomics system that is the first of its
/// kind for perpetual DEXs.

import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoint = sdk.graph.modifyEndpoint('6eeKiwCJQECCwhE7doeoKCAqSK7VatCsv3piHomYzi6o')

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

const getFetch = (query: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)));
  const dailyData: IGraphResponse = await request(endpoint, query, {
    id: String(dayTimestamp) + ":daily",
    period: "daily",
  });

  return {
    timestamp: dayTimestamp,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : '0',
  }
}

const startTimestamp = 1693997105;

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.BASE]: {
        fetch: getFetch(historicalDataSwap),
        start: startTimestamp,
      },
    },

    derivatives: {
      [CHAIN.BASE]: {
        fetch: getFetch(historicalDataDerivatives),
        start: startTimestamp,
      },
    },
  },
}

export default adapter
