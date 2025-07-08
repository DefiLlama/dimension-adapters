const { request } = require("graphql-request");
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const info: { [key: string]: any } = {
  [CHAIN.ERA]: {
    subgraph: "https://api.studio.thegraph.com/query/49271/zkswap_finance/0.0.5",
  },
  [CHAIN.SONIC]: {
    subgraph: "https://api.studio.thegraph.com/query/110179/sonic-v2/v0.0.3",
  },
};


const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  let dayMiliseconds = 24 * 60 * 60;
  let returnCount = 1000;

  let fromTimestamp = timestamp - dayMiliseconds;
  const todaysTimestamp = timestamp;

  while (returnCount == 1000) {
    const graphQL = `{
      swaps(
        orderBy: timestamp
        orderDirection: asc
        first: 1000
        where: {timestamp_gte: ${fromTimestamp}, timestamp_lt: ${todaysTimestamp} }
        ) {
          amount0In
          amount0Out
          timestamp
          pair {
            token0 {
              id
              decimals
            }
          }
        }
      }`;

    const data = await request(info[options.chain].subgraph, graphQL);
    returnCount = data.swaps.length;

    fromTimestamp = data?.swaps[returnCount - 1]?.timestamp;

    for (const swap of data.swaps) {
      const token0Id = swap.pair.token0.id;
      const multiplier = Math.pow(10, swap.pair.token0.decimals);
      dailyVolume.add(token0Id, Number(swap.amount0In) * multiplier);
      dailyVolume.add(token0Id, Number(swap.amount0Out) * multiplier);
    }
  }

  return {
    dailyVolume
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ERA]: {
      fetch,
      start: '2023-05-23',
    },
    [CHAIN.SONIC]: {
      fetch,
      start: '2025-04-09',
    },
  },
};

export default adapter;
