import BigNumber from "bignumber.js";
import request from "graphql-request";
import fetchURL from "../../utils/fetchURL";
import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";

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

  let openInterestAtEnd = 0;

  if (options.chain == CHAIN.BASE){
    openInterestAtEnd = (await fetchURL("https://api.synfutures.com/s3/config/info-page/v3/overview.json")).totalOI;
  }

  return {
    dailyVolume,
    openInterestAtEnd
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BLAST]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-02-29',
    },
    [CHAIN.BASE]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-06-26',
    },
  },
};

export default adapter;
