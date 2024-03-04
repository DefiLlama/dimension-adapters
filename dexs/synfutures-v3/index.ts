import request from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";

const info: { [key: string]: any } = {
  [CHAIN.BLAST]: {
    subgraph: "https://api.synfutures.com/thegraph/v3-blast",
  },
};

const fetch = (chain: Chain) => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    { createBalances, startTimestamp, endTimestamp, startOfDay }: FetchOptions
  ) => {
    const dailyVolume = createBalances();

    const graphQL = `{
        amms(where: {status_in: [TRADING, SETTLING]}) {
            instrument {
                quote {
                    id
                }
            }
            hourlyDataList(where: {timestamp_gte: ${startTimestamp}, timestamp_lt: ${endTimestamp}}, orderBy: timestamp, orderDirection: desc) {
                volume
            }
        }
    }`;

    const data = await request(info[chain].subgraph, graphQL);

    for (const {
      hourlyDataList,
      instrument: {
        quote: { id },
      },
    } of data.amms) {
      for (const { volume } of hourlyDataList) {
        dailyVolume.addToken(id, volume);
      }
    }

    return {
      dailyVolume,
      timestamp: startOfDay,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BLAST]: {
      fetch: fetch(CHAIN.BLAST),
      start: 1709197491,
    },
  },
};

export default adapter;
