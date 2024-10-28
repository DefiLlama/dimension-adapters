import * as sdk from "@defillama/sdk";
import { FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import request, { gql } from "graphql-request";
import customBackfill from "../../helpers/customBackfill";

interface IReferralRecord {
  volume: string; // Assuming volume is a string that represents a number
  timestamp: number;
}

type TChainIDs = {
  [key in Chain]?: number;
};

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

const fetchReferralVolume = async (timestamp: number): Promise<number> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

  const referralQuery = gql`
    {
      affiliateStats(
        where: {affiliate: "0x8c128f336b479b142429a5f351af225457a987fa", timestamp_gt: "${todaysTimestamp}"}
      ) {
        volume
      }
    }
  `;

  const referralEndpoint = "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-arbitrum-referrals/api";
  const referralRes = await request(referralEndpoint, referralQuery);
  // If there's no volume data, return 0
  if (!referralRes.affiliateStats || referralRes.affiliateStats.length === 0) {
    return 0;
  }

  return Number(referralRes.affiliateStats[0].volume) / 10 ** 30;
};


const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

    const graphQuery = gql`
      query MyQuery {
        DayProducts(filter: {date: ${todaysTimestamp}}) {
          cumulativeVolumeUsd
          chainId
        }
      }
    `;

    const endpoint = 'https://arkiver.moltennetwork.com/graphql';
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
    let dailyVolumeUSD = chainID !== undefined ? volumeByChain[chainID] || 0 : 0;

    if (chain === CHAIN.ARBITRUM) {
      const referralVolumeUSD = await fetchReferralVolume(timestamp);
      dailyVolumeUSD += referralVolumeUSD;
    }

    return {
      dailyVolume: dailyVolumeUSD.toString(),
      timestamp: todaysTimestamp
    };
  };
};


const methodology = {
  dailyVolume: "Sum of cumulativeVolumeUsd for all products on the specified chain for the given day",
};


const adapteraggderivative: any = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1687422746,
      meta: {
        methodology,
      },
    },
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: 1687422746,
      meta: {
        methodology,
      },
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1687422746,
      customBackfill: customBackfill(CHAIN.ARBITRUM, fetch),
      meta: {
        methodology,
      },
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: 1687422746,
      meta: {
        methodology,
      },
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: 1687422746,
      meta: {
        methodology,
      },
    },
    [CHAIN.METIS]: {
      fetch: fetch(CHAIN.METIS),
      start: 1687898060,
      meta: {
        methodology,
      },
    },
    [CHAIN.EVMOS]: {
      fetch: fetch(CHAIN.EVMOS),
      start: 1700104066,
      meta: {
        methodology,
      },
    },
  }
};

export default adapteraggderivative;
