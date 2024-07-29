import BigNumber from "bignumber.js";
import request from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../../utils/date";

const info: { [key: string]: any } = {
  [CHAIN.BLAST]: {
    subgraph: "https://api.synfutures.com/thegraph/v3-blast",
  },
  [CHAIN.BASE]: {
    subgraph: "https://api.synfutures.com/thegraph/v3-base",
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

const fetch = (chain: Chain) => {
  return async (
    timestamp: number,
    _: ChainBlocks,
    { createBalances, startOfDay }: FetchOptions
  ) => {
    const dailyVolume = createBalances();
    const totalVolume = createBalances();
    const to = getTimestampAtStartOfNextDayUTC(timestamp)
    const from = getTimestampAtStartOfDayUTC(timestamp)
    const graphQL = `{
        amms(where: {status_in: [TRADING, SETTLING]}) {
            instrument {
                quote {
                    id
                    decimals
                }
            }
            hourlyDataList(where: {timestamp_gte: ${from}, timestamp_lte: ${to - 1}}, orderBy: timestamp, orderDirection: desc) {
                volume
            }
        }
    }`;

    const data = await request(info[chain].subgraph, graphQL);

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

    const totalVolumeGraphQl = `{
        quoteDatas {
          id
          quote{
            decimals
          }
          totalVolume
        }
    }`;

    const totalVolumeData = await request(
      info[chain].subgraph,
      totalVolumeGraphQl
    );

    for (const {
      id,
      quote: { decimals },
      totalVolume,
    } of totalVolumeData.quoteDatas) {
      totalVolume.addToken(id, convertDecimals(totalVolume, decimals));
    }


    return {
      dailyVolume,
      totalVolume,
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
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: 1719383967,
    },
  },
};

export default adapter;
