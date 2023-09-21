
import request from "graphql-request";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

interface IGraphResponse {
  id: string;
  closeTradeVolume: string;
  platformFee: string;
}
const url = 'https://api.thegraph.com/subgraphs/name/navid-fkh/symmetrical_bsc';
const fetchVolume = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const query = `
    {
      dailyHistories(orderBy: timestamp, orderDirection:desc, where: {timestamp_gte: ${fromTimestamp}, timestamp_lte: ${toTimestamp}}) {
        id
        closeTradeVolume
        platformFee
      }
    }
  `;
  const response: IGraphResponse[] = (await request(url, query)).dailyHistories as IGraphResponse[]
  const value = response.reduce((acc, curr) => acc + Number(curr.platformFee)/10**18, 0);
  return {
    dailyFees: `${value}`,
    dailyRevenue: `${value}`,
    timestamp
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume,
      start: async () => 1687877205
    }
  }
}
export default adapter;
