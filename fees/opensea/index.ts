import { Adapter } from "../../adapters/types";
import type { ChainEndpoints } from "../../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { request, gql } from "graphql-request";
import { getPrices } from "../../utils/prices";
import BigNumber from "bignumber.js";
import { CHAIN } from "../../helpers/chains";

const v1Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/opensea-v1-ethereum",
}

const v2Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/opensea-v2-ethereum",
};

const seaportEndpoints = {
  [CHAIN.ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/messari/opensea-seaport-ethereum',
}

const getTotalFeesnRev = async (timestamp: number, graphUrl: string) => {
  const dateId = Math.floor(timestamp / 86400);

  const graphQuery = gql
    `{
        marketplaceDailySnapshot(id: ${dateId}) {
          totalRevenueETH
          marketplaceRevenueETH
        }
      }`;

  const graphRes = await request(graphUrl, graphQuery)
  const data = graphRes['marketplaceDailySnapshot'];
  if (!data) return

  return {
    timestamp,
    totalFeesETH: data.totalRevenueETH,
    totalRevenueETH: data.marketplaceRevenueETH,
  };
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const snapshot24h = await getTotalFeesnRev(todaysTimestamp, graphUrls[chain])
      const snapshot48h = await getTotalFeesnRev(todaysTimestamp - 60 * 60 * 24, graphUrls[chain])
      if (!snapshot24h || !snapshot48h) return { timestamp: todaysTimestamp }
      const ethAddress = "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
      const pricesObj24: any = await getPrices([ethAddress], todaysTimestamp);
      const latestPrice24 = new BigNumber(pricesObj24[ethAddress]["price"])
      const pricesObj48: any = await getPrices([ethAddress], todaysTimestamp - 60 * 60 * 24);
      const latestPrice48 = new BigNumber(pricesObj48[ethAddress]["price"])
      const latestPrice = latestPrice48.plus(latestPrice24).dividedBy(2)

      const dailyFeesETH = snapshot24h.totalFeesETH - snapshot48h.totalFeesETH
      const dailyRevenueETH = snapshot24h.totalRevenueETH - snapshot48h.totalRevenueETH
      
      return {
        timestamp: todaysTimestamp,
        dailyFees: (new BigNumber(dailyFeesETH).multipliedBy(latestPrice)).toString(),
        dailyRevenue: (new BigNumber(dailyRevenueETH).multipliedBy(latestPrice)).toString(),
        totalFees: (new BigNumber(snapshot24h.totalFeesETH).multipliedBy(latestPrice)).toString(),
        totalRevenue: (new BigNumber(snapshot24h.totalRevenueETH).multipliedBy(latestPrice)).toString()
      }
    };
  };
};

const adapter: Adapter = {
  breakdown: {
    v1: {
      [CHAIN.ETHEREUM]: {
        fetch: graphs(v1Endpoints)(CHAIN.ETHEREUM),
        start: async () => 1528911384
      },
    },
    v2: {
      [CHAIN.ETHEREUM]: {
        fetch: graphs(v2Endpoints)(CHAIN.ETHEREUM),
        start: async () => 1645228794
      },
    },
    seaport: {
      [CHAIN.ETHEREUM]: {
        fetch: graphs(seaportEndpoints)(CHAIN.ETHEREUM),
        start: async () => 1655055510
      },
    }
  }
}

export default adapter;
