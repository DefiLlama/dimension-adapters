import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpoint = sdk.graph.modifyEndpoint('6eeKiwCJQECCwhE7doeoKCAqSK7VatCsv3piHomYzi6o')

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        swap
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

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((options.toTimestamp * 1000)));
  const dailyData: IGraphResponse = await request(endpoint, historicalDataSwap, {
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


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BASE],
  start: 1693997105,
}

export default adapter;
