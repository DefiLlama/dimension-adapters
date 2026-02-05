import BigNumber from "bignumber.js";
import request from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const info: { [key: string]: any } = {
  [CHAIN.BLAST]: {
    subgraph: "https://api.synfutures.com/thegraph/v3-blast",
    chainId: 81457,
  },
  [CHAIN.BASE]: {
    subgraph: "https://api.synfutures.com/thegraph/v3-base",
    chainId: 8453,
  }
};

function convertDecimals(value: string | number, decimals: number) {
  if (decimals > 18) {
    return new BigNumber(value).multipliedBy(10 ** (decimals - 18)).toString();
  } else if (decimals < 18) {
    return new BigNumber(value).dividedToIntegerBy(10 ** (18 - decimals)).toString();
  } else {
    return value;
  }
}

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const graphQL = `{
      amms(where: {status_in: [TRADING, SETTLING]}) {
          instrument {
              quote {
                  id
                  decimals
              }
          }
          hourlyDataList(where: {timestamp_gte: ${options.startTimestamp}, timestamp_lte: ${options.endTimestamp - 1}}, orderBy: timestamp, orderDirection: desc) {
              volume
          }
      }
  }`;

  const data = await request(info[options.chain].subgraph, graphQL);

  for (const {
    hourlyDataList,
    instrument: {
      quote: { id, decimals },
    },
  } of data.amms) {
    for (const { volume } of hourlyDataList) {
      dailyVolume.addToken(id, convertDecimals(volume, decimals));
    }
  }

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    // [CHAIN.BLAST]: {
    //   fetch,
    //   start: '2024-02-29',
    // }, sunset -> '2025-04-11
    [CHAIN.BASE]: {
      fetch,
      start: '2024-06-26',
    },
  },
};

export default adapter;
