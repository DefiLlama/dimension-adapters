import { Adapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import type { ChainEndpoints, FetchOptions } from "../../adapters/types"
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

const endpoints = {
  [CHAIN.NEO]: "https://api-external.ghostmarket.io/defillama/fees?chain=n3&timestamp=",
  [CHAIN.BSC]: "https://api-external.ghostmarket.io/defillama/fees?chain=bsc&timestamp=",
  [CHAIN.AVAX]: "https://api-external.ghostmarket.io/defillama/fees?chain=avalanche&timestamp=",
  [CHAIN.POLYGON]: "https://api-external.ghostmarket.io/defillama/fees?chain=polygon&timestamp=",
  [CHAIN.ETHEREUM]: "https://api-external.ghostmarket.io/defillama/fees?chain=eth&timestamp=",
  [CHAIN.PHANTASMA]: "https://api-external.ghostmarket.io/defillama/fees?chain=pha&timestamp=",
  [CHAIN.BASE]: "https://api-external.ghostmarket.io/defillama/fees?chain=base&timestamp=",
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
    return async ({ endTimestamp }: FetchOptions) => {
      const url = await buildUrl(apiUrls[chain], endTimestamp);
      const data = (await fetchURL(url));

      return {
        dailyFees: String(data.dailyFees),
        totalFees: String(data.userFees),
        dailyUserFees: String(data.dailyFees),
        totalUserFees: String(data.userFees),
        dailyRevenue: String(data.dailyRevenue),
        totalRevenue: String(data.protocolRevenue),
        dailyProtocolRevenue: String(data.dailyRevenue),
        totalProtocolRevenue: String(data.protocolRevenue),
        dailyVolume: String(data.dailyVolume),
        totalVolume: String(data.totalVolume),
        dailyHoldersRevenue: String(data.dailyFees * 0.2),
        totalHoldersRevenue: String(data.userFees * 0.2),
      }
    };
  };
};

const adapter: Adapter = {
  deadFrom: "2024-12-14",
  version: 2,
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.NEO]: {
      fetch: apis(endpoints)(CHAIN.NEO),
      start: '2021-08-24',
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch: apis(endpoints)(CHAIN.BSC),
      start: '2022-05-30',
      meta: {
        methodology
      }
    },
    [CHAIN.AVAX]: {
      fetch: apis(endpoints)(CHAIN.AVAX),
      start: '2022-05-30',
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: apis(endpoints)(CHAIN.POLYGON),
      start: '2022-05-30',
      meta: {
        methodology
      }
    },
    [CHAIN.ETHEREUM]: {
      fetch: apis(endpoints)(CHAIN.ETHEREUM),
      start: '2022-05-13',
      meta: {
        methodology
      }
    },
    [CHAIN.PHANTASMA]: {
      fetch: apis(endpoints)(CHAIN.PHANTASMA),
      start: '2019-12-30',
      meta: {
        methodology
      }
    },
    [CHAIN.BASE]: {
      fetch: apis(endpoints)(CHAIN.BASE),
      start: '2023-08-10',
      meta: {
        methodology
      }
    }
  }
}

export default adapter;
