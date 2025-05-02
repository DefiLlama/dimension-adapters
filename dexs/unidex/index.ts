import { FetchResultVolume, BreakdownAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import { adapter_dexs_agg } from './unidex-dexs-agg/index';

type TChainIDs = { [key in Chain]?: number; };
const chainIDs: TChainIDs = {
  [CHAIN.FANTOM]: 250,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.ERA]: 324,
  [CHAIN.BASE]: 8453,
  [CHAIN.EVMOS]: 9001,
  [CHAIN.METIS]: 1088,
};

interface IDayProduct {
  cumulativeVolumeUsd: number;
  chainId: number;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const graphQuery = gql`
      query MyQuery {
        DayProducts(limit: 0, filter: { date: ${todaysTimestamp} }) {
          cumulativeVolumeUsd
          chainId
        }
      }
    `;
    const endpoint = "https://arkiver.moltennetwork.com/graphql";
    const response = await request(endpoint, graphQuery);
    const dayProducts: IDayProduct[] = response.DayProducts;

    const volumeByChain: { [chainId: number]: number } = {};
    dayProducts.forEach((product) => {
      const chainId = product.chainId;
      if (chainId === 360) {
        // Combine volume for chainID 360 with chainID 42161
        volumeByChain[42161] = (volumeByChain[42161] || 0) + product.cumulativeVolumeUsd;
      } else {
        volumeByChain[chainId] = (volumeByChain[chainId] || 0) + product.cumulativeVolumeUsd;
      }
    });

    const chainID = chainIDs[chain];
    const dailyVolumeUSD = chainID !== undefined ? volumeByChain[chainID] || 0 : 0;

    return {
      dailyVolume: dailyVolumeUSD.toString(),
      timestamp: todaysTimestamp,
    };
  };
};

const methodology = {
  dailyVolume: "Sum of cumulativeVolumeUsd for all products on the specified chain for the given day",
};

const adapter: any = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-06-22',
      meta: { methodology },
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: '2023-06-22',
      meta: { methodology },
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2023-06-22',
      meta: { methodology },
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: '2023-06-22',
      meta: { methodology },
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: '2023-06-22',
      meta: { methodology },
    },
    [CHAIN.METIS]: {
      fetch: fetch(CHAIN.METIS),
      start: '2023-06-27',
      meta: { methodology },
    },
    [CHAIN.EVMOS]: {
      fetch: fetch(CHAIN.EVMOS),
      start: '2023-11-16',
      meta: { methodology },
    },
  },
};

const adapterbreakdown: BreakdownAdapter = {
  breakdown: {
    "unidex": adapter["adapter"],
    "unidex-dexs-agg": adapter_dexs_agg["adapter"],
  }
};

export default adapterbreakdown;
