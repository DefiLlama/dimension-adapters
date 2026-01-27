import { request, gql } from "graphql-request";

const subgraphUrl =
  "https://subgraph.increment.finance/subgraphs/name/Increment-Finance/subgraph";

const volumeQuery = gql`
  query volumeQuery($endTimestamp: Int!) {
    dailyCandles(
      orderBy: openTimestamp
      orderDirection: desc
      first: 24
      where: { openTimestamp: $endTimestamp }
    ) {
      volume
    }
  }
`;

export default {
  adapter: {
    era: {
      fetch: async (_t: any, _c: any, { endTimestamp }) => {
        const volumeData = await request(subgraphUrl, volumeQuery, {
          endTimestamp: endTimestamp ?? Math.floor(Date.now() / 1000)
        });
        const dailyVolume = volumeData.dailyCandles.reduce(
          (acc, { volume }) => acc + volume * 10 ** -18,
          0
        );
        return { dailyVolume };
      },
      start: '2024-03-18'
    }
  }
};
