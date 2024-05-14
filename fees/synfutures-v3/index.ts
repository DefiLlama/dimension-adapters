import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchV2 } from "../../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.BLAST]: "https://api.synfutures.com/thegraph/v3-blast",
}

// Fee = LiquidityFee + ProtocolFee
// LiquidityFee = MakerRebates + FeesToLP
const methodology = {
  Fees: "fees paid by takers on the protocol by using market orders, these fees paid goes to limit order makers, AMM LP and protocol fees",
  MakerRebates: "fees rebated received by limit order makers on the protocol, these fees are paid by takers",
  FeesToLp: "fees received by AMM LPs on the protocol, these fees are paid by takers",
  ProcotolFees: "fees received by the protocol from takers, these fees are paid by takers"
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
      const dailyProcotolFees = createBalances();

      const totalFee = createBalances();
      const totalMakerRebates = createBalances();
      const totalFeesToLP = createBalances();
      const totalProcotolFees = createBalances();

      const graphRes = await request(graphUrls[chain], graphQuery);

      for (const record of graphRes.dailyQuoteDatas) {
        dailyFee.addToken(record.quote.id, Number(record.liquidityFee) + Number(record.protocolFee))
        dailyMakerRebates.addToken(record.quote.id, Number(record.liquidityFee) - Number(record.poolFee))
        dailyFeesToLP.addToken(record.quote.id, Number(record.poolFee))
        dailyProcotolFees.addToken(record.quote.id, Number(record.protocolFee))

        totalFee.addToken(record.quote.id, Number(record.totalLiquidityFee) + Number(record.totalProtocolFee))
        totalMakerRebates.addToken(record.quote.id, Number(record.totalLiquidityFee) - Number(record.totalPoolFee))
        totalFeesToLP.addToken(record.quote.id, Number(record.totalPoolFee))
        totalProcotolFees.addToken(record.quote.id, Number(record.totalProtocolFee))
      }

      return {
        dailyFees: await dailyFee.getUSDValue(),
        dailyMakerRebates: await dailyMakerRebates.getUSDValue(),
        dailyFeesToLp: await dailyFeesToLP.getUSDValue(),
        dailyProcotolFees: await dailyProcotolFees.getUSDValue(),

        totalFees: await totalFee.getUSDValue(),
        totalMakerRebates: await totalMakerRebates.getUSDValue(),
        totalFeesToLp: await totalFeesToLP.getUSDValue(),
        totalProcotolFees: await totalProcotolFees.getUSDValue()
      };
    };
    return fetch 
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BLAST]: {
      fetch: graphs(endpoints),
      start: 1709049600,
      meta: {
        methodology
      }
    }
  }
}

export default adapter;
