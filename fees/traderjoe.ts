import {
  getDexChainFees,
  getUniqStartOfTodayTimestamp,
} from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../dexs/traderjoe";
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../helpers/chains";
import {httpGet} from "../utils/fetchURL";

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
};
const endpointsV2: TEndpoint = {
  [CHAIN.AVAX]:
    "https://barn.traderjoexyz.com/v1/dex/analytics/avalanche?startTime=1669420800&aggregateBy=daily",
  [CHAIN.ARBITRUM]:
    "https://barn.traderjoexyz.com/v1/dex/analytics/arbitrum?startTime=1672012800&aggregateBy=daily",
  [CHAIN.BSC]:
    "https://barn.traderjoexyz.com/v1/dex/analytics/binance?startTime=1677801600&aggregateBy=daily",
  [CHAIN.ETHEREUM]:
    "https://barn.traderjoexyz.com/v1/dex/analytics/ethereum?startTime=1695513600&aggregateBy=daily",
};

const adapterV1 = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  revenue: PROTOCOL_FEES,
  supplySideRevenue: LP_FEE,
  holdersRevenue: HOLDER_REV,
  volumeAdapter: { adapter: volumeAdapter.breakdown.v1 },
});

const graph = async (options: FetchOptions) => {
    const dayTimestamp = options.startOfDay * 1000
      const url = `https://api.traderjoexyz.dev/v1/dex/analytics/${mapChain(options.chain)}?startTime=${options.startTimestamp}&endTime=${options.endTimestamp}`
    const historical: IData[] = (await httpGet(url, { headers: {
      'x-traderjoe-api-key': process.env.TRADERJOE_API_KEY
    }}));
    const dailyFees =
      historical.find((dayItem) => dayItem.timestamp === dayTimestamp)
        ?.feesUsd || 0;
    const dailyRevenue =
      historical.find((dayItem) => dayItem.timestamp === dayTimestamp)
        ?.protocolFeesUsd || 0;
    return {
      dailyUserFees: `${dailyFees}`,
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      dailyHoldersRevenue: `${dailyRevenue}`,
      dailySupplySideRevenue: dailyFees
        ? `${(dailyFees || 0) - (dailyRevenue || 0)}`
        : undefined,
      dailyProtocolRevenue: `${dailyRevenue}`,
    };
};

const mapChain = (chain: Chain): string => {
  if (chain === CHAIN.BSC) return "binance";
  if (chain === CHAIN.AVAX) return "avalanche";
  return chain;
};

const adapter: Adapter = {
  version: 2,
  breakdown: {
    v1: adapterV1,
    v2: {
      [CHAIN.AVAX]: {
        fetch: graph,
        start: 1669420800,
      },
      [CHAIN.ARBITRUM]: {
        fetch: graph,
        start: 1672012800,
      },
      [CHAIN.BSC]: {
        fetch: graph,
        start: 1678147200,
      },
      [CHAIN.ETHEREUM]: {
        fetch: graph,
        start: 1695513600,
      },
    },
  },
};

export default adapter;
