import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchV2 } from "../../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.BLAST]: "https://api.synfutures.com/thegraph/v3-blast",
}

const methodology = {
  Fees: "Fees paid by takers"
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
          takerFee
          protocolFee

          totalTakerFee
          totalProtocolFee
        }
      }`;

      const dailyFee = createBalances();
      const totalFee = createBalances();

      const graphRes = await request(graphUrls[chain], graphQuery);

      // console.info(JSON.stringify(graphRes, null, 2));

      for (const record of graphRes.dailyQuoteDatas) {
        dailyFee.addToken(record.quote.id, Number(record.takerFee) + Number(record.protocolFee))
        totalFee.addToken(record.quote.id, Number(record.totalTakerFee) + Number(record.totalProtocolFee))
      }

      return {
        dailyFees: await dailyFee.getUSDValue(),
        totalFees: await totalFee.getUSDValue(),
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
