import request from "graphql-request";
import type { ChainBlocks, FetchOptions, FetchResponseValue, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

interface Exchange {
  tokenInAmount: string;
  tokenOutAmount: string;
  tokenIn: {
    token: {
      id: string;
      decimals: string;
    };
  };
  tokenOut: {
    token: {
      id: string;
      decimals: string;
    };
  };
}

const subgraphUrl = "https://api.goldsky.com/api/public/project_cm33d1338c1jc010e715n1z6n/subgraphs/stable-swap-factory-ng-contracts-subgraph-flow-mainnet/2.2.0/gn"

const fetch = async (
  timestamp: number,
  _chainBlocks: ChainBlocks,
  options: FetchOptions
): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const query = `{
    poolTokensExchanges(
      where: {
        timestamp_gte: "${dayTimestamp}",
        timestamp_lt: "${dayTimestamp + 86400}"
      }
      orderBy: timestamp
      orderDirection: asc
    ) {
      tokenInAmount
      tokenOutAmount
      tokenIn {
        token {
          id
          decimals
        }
      }
      tokenOut {
        token {
          id
          decimals
        }
      }
    }
  }`
  const res = await request(subgraphUrl, query);

  const volumeData = options.createBalances();

  for (const curr of res.poolTokensExchanges as Exchange[]) {
    volumeData.add(curr.tokenIn.token.id, BigInt(curr.tokenInAmount));
    volumeData.add(curr.tokenOut.token.id, BigInt(curr.tokenOutAmount));
  }

  return {
    timestamp: dayTimestamp,
    dailyVolume: volumeData,
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FLOW]: {
      fetch,
    },
  },
};

export default adapter;
