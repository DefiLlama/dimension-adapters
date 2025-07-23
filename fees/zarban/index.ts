import { Adapter, FetchV2, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL"

const GRAPHQL_ENDPOINT = 'https://api.studio.thegraph.com/query/93681/zarban-subgraph/version/latest';

const getRevenueQuery = (startTimestamp: number, endTimestamp: number) => `
query {
  financialsDailySnapshots(where: {timestamp_gte: ${startTimestamp.toString()}, timestamp_lte: ${endTimestamp.toString()}}) {
    dailyTotalRevenueUSD
    dailySupplySideRevenueUSD
    dailyProtocolSideRevenueUSD
    cumulativeSupplySideRevenueUSD
    cumulativeProtocolSideRevenueUSD
    cumulativeTotalRevenueUSD
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
        const dailySupplySideRevenue = createBalances()
        const dailyProtocolRevenue = createBalances()

        const totalSupplySideRevenue = createBalances()
        const totalProtocolRevenue = createBalances()
        const totalRevenue = createBalances()
        totalSupplySideRevenue.addUSDValue(BigInt(financialsDailySnapshots[financialsDailySnapshots.length - 1].cumulativeSupplySideRevenueUSD.split('.')[0]));
        totalProtocolRevenue.addUSDValue(BigInt(financialsDailySnapshots[financialsDailySnapshots.length - 1].cumulativeProtocolSideRevenueUSD.split('.')[0]));
        totalRevenue.addUSDValue(BigInt(financialsDailySnapshots[financialsDailySnapshots.length - 1].cumulativeTotalRevenueUSD.split('.')[0]));


        for (const dailySnapshot of financialsDailySnapshots) {
          dailyRevenue.addUSDValue(BigInt(dailySnapshot.dailyTotalRevenueUSD.split('.')[0]));
          dailySupplySideRevenue.addUSDValue(BigInt(dailySnapshot.dailySupplySideRevenueUSD.split('.')[0]));
          dailyProtocolRevenue.addUSDValue(BigInt(dailySnapshot.dailyProtocolSideRevenueUSD.split('.')[0]));
        }

        return {
          dailyRevenue,
          dailySupplySideRevenue,
          dailyProtocolRevenue,
          totalSupplySideRevenue,
          totalProtocolRevenue,
          totalRevenue,
          dailyFees: dailyRevenue,
          totalFees: totalRevenue,
        }
      }) as FetchV2,
      start: '2023-04-30',
    },
  },
  version: 2,
} as Adapter
