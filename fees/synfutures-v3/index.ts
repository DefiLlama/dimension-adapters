import BigNumber from "bignumber.js";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchV2, Adapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.BLAST]: "https://api.synfutures.com/thegraph/v3-blast",
  [CHAIN.BASE]: "https://api.synfutures.com/thegraph/v3-base",
}

// Fee = LiquidityFee + ProtocolFee
// LiquidityFee = MakerRebates + FeesToLP
const methodology = {
  Fees: "fees paid by takers on the protocol by using market orders, these fees paid goes to limit order makers, AMM LP and protocol fees",
  MakerRebates: "fees rebated received by limit order makers on the protocol, these fees are paid by takers",
  FeesToLp: "fees received by AMM LPs on the protocol, these fees are paid by takers",
  ProcotolFees: "fees received by the protocol from takers, these fees are paid by takers"
}

function convertDecimals(value: string | number, decimals: number) {
  if (decimals > 18) {
    return new BigNumber(value).multipliedBy(10 ** (decimals - 18)).toString();
  } else if (decimals < 18) {
    return new BigNumber(value).dividedToIntegerBy(10 ** (18 - decimals)).toString();
  } else {
    return value;
  }
}

const graphs = (graphUrls: ChainEndpoints) => {
    const fetch: FetchV2 = async ({ chain, startTimestamp, createBalances }) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(startTimestamp)
      const graphQuery = gql
      `{
        dailyQuoteDatas(where: {timestamp: "${todaysTimestamp}"}){
          timestamp
          quote{
            id
            symbol
            decimals
          }
          liquidityFee
          poolFee
          protocolFee

          totalLiquidityFee
          totalPoolFee
          totalProtocolFee
        }
      }`;

      const dailyFee = createBalances();
      const dailyMakerRebates = createBalances();
      const dailyFeesToLP = createBalances();
      const dailyProtocolRevenue = createBalances();

      const graphRes = await request(graphUrls[chain], graphQuery);

      for (const record of graphRes.dailyQuoteDatas) {
        dailyFee.addToken(record.quote.id, convertDecimals(Number(record.liquidityFee) + Number(record.protocolFee), record.quote.decimals))
        dailyMakerRebates.addToken(record.quote.id, convertDecimals(Number(record.liquidityFee) - Number(record.poolFee), record.quote.decimals))
        dailyFeesToLP.addToken(record.quote.id, convertDecimals(Number(record.poolFee), record.quote.decimals))
        dailyProtocolRevenue.addToken(record.quote.id, convertDecimals(Number(record.protocolFee), record.quote.decimals))
      }

      return {
        dailyFees: dailyFee,
        dailyRevenue: dailyProtocolRevenue,
        dailyProtocolRevenue,
      };
    };
    return fetch 
};


const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    // [CHAIN.BLAST]: {
    //   fetch: graphs(endpoints),
    //   start: '2024-02-27',
    // }, sunset -> '2025-04-11
    [CHAIN.BASE]: {
      fetch: graphs(endpoints),
      start: '2024-06-26',
    }
  }
}

export default adapter;
