import request from "graphql-request";
import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


const endpoints: { [key: string]: string } = {
  blast: 'https://graphql.predict.fun/graphql'
}

const  query = (after?: string) => `query {
  categories (pagination: {
    first: 100
    ${after ? `after: "${after}"` : ''}
  }) {
    totalCount
    pageInfo {
      hasNextPage
      startCursor
      endCursor
    }
    edges {
      node {
        id
        slug
        title
        statistics {
          liquidityValueUsd
          volume24hUsd
          volumeTotalUsd
        }
      }
    }
  }
}
`

const fetch: Fetch = async (_: any, __, { chain }) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp()
  const categories: any = []
  let after
  do {
    const data = await request(endpoints[chain], query(after))
    categories.push(...data.categories.edges)
    if (data.categories.pageInfo.hasNextPage) {
      after = data.pageInfo.endCursor
    }
  } while (after)
  const dailyVolume =  categories.reduce((vol, category) => vol + category.node.statistics.volume24hUsd, 0)
  

  return {
    timestamp: dayTimestamp,
    dailyVolume,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.BLAST]: 1691128800,
}

const volume = Object.keys(endpoints).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch,
      start: startTimestamps[chain]
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  adapter: volume
};
export default adapter;
