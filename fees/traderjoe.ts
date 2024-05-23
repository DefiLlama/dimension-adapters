import { getDexChainFees, getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/traderjoe";
import { Adapter, FetchResultFees } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";


const TOTAL_FEES = 0.003;
const LP_FEE = 0.0025;
const PROTOCOL_FEES = 0.0005;
const HOLDER_REV = 0.0005;

interface IData {
  feesUsd: number;
  protocolFeesUsd: number;
  timestamp: number;
}

type TEndpoint = {
  [s: string | Chain]: string;
}
const endpointsV2: TEndpoint = {
  [CHAIN.AVAX]: "https://barn.traderjoexyz.com/v1/dex/analytics/avalanche?startTime=1669420800&aggregateBy=daily",
  [CHAIN.ARBITRUM]: "https://barn.traderjoexyz.com/v1/dex/analytics/arbitrum?startTime=1672012800&aggregateBy=daily",
  [CHAIN.BSC]: "https://barn.traderjoexyz.com/v1/dex/analytics/binance?startTime=1677801600&aggregateBy=daily",
  [CHAIN.ETHEREUM]: "https://barn.traderjoexyz.com/v1/dex/analytics/ethereum?startTime=1695513600&aggregateBy=daily"
}

const adapterV1 = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  revenue: PROTOCOL_FEES,
  supplySideRevenue: LP_FEE,
  holdersRevenue: HOLDER_REV,
  volumeAdapter: {adapter: volumeAdapter.breakdown.v1}
});

const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical: IData[] = (await fetchURL(endpointsV2[chain]));
    const dailyFees = historical
      .find(dayItem => dayItem.timestamp === dayTimestamp)?.feesUsd || 0
    const dailyRevenue = historical
      .find(dayItem => dayItem.timestamp === dayTimestamp)?.protocolFeesUsd || 0
    return {
      dailyUserFees: `${dailyFees}`,
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      dailyHoldersRevenue: `${dailyRevenue}`,
      dailySupplySideRevenue: dailyFees ? `${(dailyFees || 0) - (dailyRevenue || 0)}` : undefined,
      dailyProtocolRevenue: `${dailyRevenue}`,
      timestamp
    }
  }
}

const adapter: Adapter = {
  breakdown: {
    v1: adapterV1,
    v2: {
      [CHAIN.AVAX]: {
        fetch: graph(CHAIN.AVAX),
        start: 1669420800
      },
      [CHAIN.ARBITRUM]: {
        fetch: graph(CHAIN.ARBITRUM),
        start: 1672012800
      },
      [CHAIN.BSC]: {
        fetch: graph(CHAIN.BSC),
        start: 1678147200
      },
      [CHAIN.ETHEREUM]: {
        fetch: graph(CHAIN.ETHEREUM),
        start: 1695513600
      }
    }
  }
};


export default adapter;
