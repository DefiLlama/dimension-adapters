import { Adapter } from "../../adapters/types";
import type { ChainEndpoints } from "../../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.NEO]: "https://api-external.ghostmarket.io/defillama/fees?chain=n3&timestamp=",
  [CHAIN.BSC]: "https://api-external.ghostmarket.io/defillama/fees?chain=bsc&timestamp=",
  [CHAIN.AVAX]: "https://api-external.ghostmarket.io/defillama/fees?chain=avalanche&timestamp=",
  [CHAIN.POLYGON]: "https://api-external.ghostmarket.io/defillama/fees?chain=polygon&timestamp=",
  [CHAIN.ETHEREUM]: "https://api-external.ghostmarket.io/defillama/fees?chain=eth&timestamp=",
  [CHAIN.PHANTASMA]: "https://api-external.ghostmarket.io/defillama/fees?chain=pha&timestamp=",
}

const buildUrl = async (apiUrl: string, timestamp: number) => {
  return apiUrl + timestamp.toString();
}

const methodology = {
  Fees: "Users pay 2% fees on each trade",
  UserFees: "Users pay 2% fees on each trade",
  ProtocolRevenue: "Protocol gets 2% of each trade",
  Revenue: "Revenue is 2% of each trade",
  HoldersRevenue: "20% of user fees goes to GFUND single stake pool"
}


const apis = (apiUrls: ChainEndpoints) => {
  return (chain: CHAIN) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const url = await buildUrl(apiUrls[chain], todaysTimestamp);
      const data = (await fetchURL(url)).data;

      return {
        timestamp,
        dailyFees: data.dailyFees,
        totalFees: data.userFees,
        dailyUserFees: data.dailyFees,
        totalUserFees: data.userFees,
        dailyRevenue: data.dailyRevenue,
        totalRevenue: data.protocolRevenue,
        dailyProtocolRevenue: data.dailyRevenue,
        totalProtocolRevenue: data.protocolRevenue,
        dailyVolume: data.dailyVolume,
        totalVolume: data.totalVolume,
        dailyHoldersRevenue: data.dailyFees * 0.2,
        totalHoldersRevenue: data.userFees * 0.2
      }
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.NEO]: {
      fetch: apis(endpoints)(CHAIN.NEO),
      start: async () => 1629813600,
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch: apis(endpoints)(CHAIN.BSC),
      start: async () => 1653868800,
      meta: {
        methodology
      }
    },
    [CHAIN.AVAX]: {
      fetch: apis(endpoints)(CHAIN.AVAX),
      start: async () => 1653868800,
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: apis(endpoints)(CHAIN.POLYGON),
      start: async () => 1653868800,
      meta: {
        methodology
      }
    },
    [CHAIN.ETHEREUM]: {
      fetch: apis(endpoints)(CHAIN.ETHEREUM),
      start: async () => 1652400000,
      meta: {
        methodology
      }
    },
    [CHAIN.PHANTASMA]: {
      fetch: apis(endpoints)(CHAIN.PHANTASMA),
      start: async () => 1577664000,
      meta: {
        methodology
      }
    }
  }
}

export default adapter;
