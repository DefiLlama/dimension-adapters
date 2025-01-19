import { Adapter, FetchV2, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL"

const GRAPHQL_ENDPOINT = 'https://api.studio.thegraph.com/query/93681/zarban-subgraph/version/latest';

const getRevenueQuery = (startTimestamp: number, endTimestamp: number) => `
query {
  financialsDailySnapshots(where: {timestamp_gte: ${startTimestamp.toString()}, timestamp_lte: ${endTimestamp.toString()}}) {
    dailyTotalRevenueUSD
    }
  }
`;

export default {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: (async ({ createBalances, startTimestamp, endTimestamp }) => {

        const financialsDailySnapshots = (await postURL(GRAPHQL_ENDPOINT, {
          query: getRevenueQuery(startTimestamp, endTimestamp),
          operationName: 'getRevenue'
        })).data.financialsDailySnapshots;

        const dailyRevenue = createBalances()

        for (const dailySnapshot of financialsDailySnapshots) {
          dailyRevenue.addUSDValue(BigInt(dailySnapshot.dailyTotalRevenueUSD.split('.')[0]));
        }
        return { dailyRevenue }
      }) as FetchV2,
      start: 77669795,
    },
  },
  version: 2,
} as Adapter