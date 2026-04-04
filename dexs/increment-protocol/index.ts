import { FetchOptions } from "../../adapters/types";
import { request, gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";

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
    [CHAIN.ERA]: {
      fetch: async (_t: any, _c: any, { endTimestamp }: FetchOptions) => {
        const volumeData = await request(subgraphUrl, volumeQuery, {
          endTimestamp: endTimestamp ?? Math.floor(Date.now() / 1000)
        });
        const dailyVolume = volumeData.dailyCandles.reduce(
          (acc: number, { volume }: { volume: number }) => acc + volume * 10 ** -18,
          0
        );
        return { dailyVolume };
      },
      start: '2024-03-18'
    }
  }
};
