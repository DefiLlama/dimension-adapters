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
  const ethAddress = "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const pricesObj: any = await getPrices([ethAddress], timestamp);
  const latestPrice = new BigNumber(pricesObj[ethAddress]["price"])

  const graphRes = await request(graphUrl, graphQuery)
  const data = graphRes['marketplaceDailySnapshot'];
  if (!data) return
  const dailyFee = new BigNumber(data.totalRevenueETH).multipliedBy(latestPrice)
  const dailyRev = new BigNumber(data.marketplaceRevenueETH).multipliedBy(latestPrice)

  return {
    timestamp,
    totalFees: dailyFee.toString(),
    totalRevenue: dailyRev.toString(),
  };
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const snapshot24h = await getTotalFeesnRev(todaysTimestamp, graphUrls[chain])
      const snapshot48h = await getTotalFeesnRev(todaysTimestamp - 60 * 60 * 24, graphUrls[chain])
      if (!snapshot24h || !snapshot48h) return { timestamp: todaysTimestamp }
      return {
        timestamp: todaysTimestamp,
        dailyFees: String(+snapshot24h?.totalFees - +snapshot48h?.totalFees),
        dailyRevenue: String(+snapshot24h?.totalRevenue - +snapshot48h?.totalRevenue),
        totalFees: snapshot24h?.totalFees,
        totalRevenue: snapshot24h?.totalRevenue
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
