import { Adapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";
import fetchURL from "../../utils/fetchURL";

const API_ENDPOINT = "http://stats.symphony.ag/api/v1/stats";

interface IVolumeResponse {
  allTime: {
    totalTrades: number;
    totalVolumeUSD: number;
  };
  last24Hours: {
    numberOfTrades: number;
    volumeUSD: number;
  };
}

const mapChainId = {
  [CHAIN.SEI]: 'sei',
} as const;

export function getSymphAdapter(type: "volume") {
  const fetch = (chain: Chain) => {
    return async (timestampInput: any): Promise<FetchResultVolume> => {
      try {
        const timestamp = typeof timestampInput === 'object' ? 
          timestampInput.startOfDay || timestampInput.toTimestamp : 
          timestampInput;

        if (!timestamp || isNaN(timestamp)) {
          throw new Error(`Invalid timestamp: ${JSON.stringify(timestampInput)}`);
        }

        const response: IVolumeResponse = await fetchURL(`${API_ENDPOINT}?timestamp=${timestamp}`);

        if (!response || !response.last24Hours || !response.allTime) {
          throw new Error('Invalid response from API');
        }

        return {
          dailyVolume: response.last24Hours.volumeUSD.toString(),
          totalVolume: response.allTime.totalVolumeUSD.toString(),
          timestamp,
        };
      } catch (error) {
        console.error(`Error fetching Symph volume for chain ${chain}:`, error);
        throw error;
      }
    };
  };

  const adapter: Adapter = {
    version: 2,
    adapter: {
      [CHAIN.SEI]: {
        fetch: fetch(CHAIN.SEI),
        start: 1703376000, // Dec 24, 2024 00:00:00 UTC
        meta: {
          methodology: 'Tracks the total value of all trades executed through Symphony Aggregator on SEI chain. Volume is calculated by summing the USD value of all trades.'
        }
      },
    },
  };

  return adapter;
} 