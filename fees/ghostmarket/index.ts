import { Adapter } from "../../adapters/types";
import type { FetchOptions } from "../../adapters/types"
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const endpoints:Record<string, string> = {
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


const fetch =  async ({chain, endTimestamp }: FetchOptions) => {
  const url = await buildUrl(endpoints[chain], endTimestamp);
  const data = (await fetchURL(url));

  return {
    dailyFees: String(data.dailyFees),
    dailyUserFees: String(data.dailyFees),
    dailyRevenue: String(data.dailyRevenue),
    dailyProtocolRevenue: String(data.dailyRevenue),
    dailyVolume: String(data.dailyVolume),
    dailyHoldersRevenue: String(data.dailyFees * 0.2),
  }
};

const adapter: Adapter = {
  deadFrom: "2024-12-14",
  version: 2,
  adapter: {
    [CHAIN.NEO]: {
      fetch,
      start: '2021-08-24',
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2022-05-30',
      meta: {
        methodology
      }
    },
    [CHAIN.AVAX]: {
      fetch,
      start: '2022-05-30',
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2022-05-30',
      meta: {
        methodology
      }
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-05-13',
      meta: {
        methodology
      }
    },
    [CHAIN.PHANTASMA]: {
      fetch,
      start: '2019-12-30',
      meta: {
        methodology
      }
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2023-08-10',
      meta: {
        methodology
      }
    }
  }
}

export default adapter;
