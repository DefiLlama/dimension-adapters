import { request, gql } from "graphql-request";

const subgraphUrl =
  "https://subgraph.increment.finance/subgraphs/name/Increment-Finance/subgraph";

const volumeQuery = gql`
  query volumeQuery($endTimestamp: Int!) {
    markets {
      hourlyCandles(
        orderBy: openTimestamp
        orderDirection: desc
        first: 24
        where: { openTimestamp_lte: $endTimestamp }
      ) {
        volume
      }
      dailyCandles(
        orderBy: openTimestamp
        orderDirection: desc
        first: 1000
        where: { openTimestamp_lte: $endTimestamp }
      ) {
        volume
      }
    }
  }
`;

export default {
  adapter: {
    era: {
      fetch: async ({ endTimestamp }) => {
        const volumeData = await request(subgraphUrl, volumeQuery, {
          endTimestamp: endTimestamp ?? Math.floor(Date.now() / 1000)
        });
        let dailyVolume = 0;
        let totalVolume = 0;
        for (const market of volumeData.markets) {
          dailyVolume += market.hourlyCandles.reduce(
            (acc, { volume }) => acc + volume * 10 ** -18,
            0
          );
          totalVolume += market.dailyCandles.reduce(
            (acc, { volume }) => acc + volume * 10 ** -18,
            0
          );
        }
        return { dailyVolume, totalVolume };
      },
      start: 1710004200 // 2024-03-09 09:10
    }
  }
};
