import { Adapter, FetchOptions } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";
import * as sdk from "@defillama/sdk";
import { getChainVolume } from "../helpers/getUniSubgraphVolume";

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

const endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('9ZjERoA7jGANYNz1YNuFMBt11fK44krveEhzssJTWokM'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('3VgCBQh13PseR81hPNAbKua3gD8b8r33LauKjVnMbSAs'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('3jFnXqk6UXZyciPu5jfUuPR7kzGXPSndsLNrWXQ6xAxk'),
};

const graphsV1 = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "volumeUSD",
  },
});
const graph = async (_t: any, _tt: any, options: FetchOptions) => {
    const dayTimestamp = options.startOfDay;
    const start = options.startOfDay;
    const end = start + 24 * 60 * 60;
      const url = `https://api.traderjoexyz.dev/v1/dex/analytics/${mapChain(options.chain)}?startTime=${start}&endTime=${end}`
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
      timestamp: options.startOfDay,
    };
};

const mapChain = (chain: Chain): string => {
  if (chain === CHAIN.BSC) return "binance";
  if (chain === CHAIN.AVAX) return "avalanche";
  return chain;
};

const adapter: Adapter = {
  version: 1,
  breakdown: {
    v1: {
      [CHAIN.ARBITRUM]: {
        fetch: async (_t: any, _tt: any, options: FetchOptions) => {
          const data = await graphsV1(CHAIN.ARBITRUM)(_t, _tt, options);
          return {
            dailyFees: data.dailyVolume ? `${Number(data.dailyVolume) * TOTAL_FEES}` : "0",
            dailyUserFees: data.dailyVolume ? `${Number(data.dailyVolume) * TOTAL_FEES}` : "0",
            dailyRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * PROTOCOL_FEES}` : "0",
            dailyHoldersRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * HOLDER_REV}` : "0",
            dailySupplySideRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * LP_FEE}` : "0",
            timestamp: options.startOfDay,
          };
        },
        start: '2022-12-26',
      },
      [CHAIN.BSC]: {
        fetch: async (_t: any, _tt: any, options: FetchOptions) => {
          const data = await graphsV1(CHAIN.BSC)(_t, _tt, options);
          return {
            dailyFees: data.dailyVolume ? `${Number(data.dailyVolume) * TOTAL_FEES}` : "0",
            dailyUserFees: data.dailyVolume ? `${Number(data.dailyVolume) * TOTAL_FEES}` : "0",
            dailyRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * PROTOCOL_FEES}` : "0",
            dailyHoldersRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * HOLDER_REV}` : "0",
            dailySupplySideRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * LP_FEE}` : "0",
            timestamp: options.startOfDay,
          };
        },
        start: '2022-10-04',
      },
      [CHAIN.AVAX]: {
        fetch: async (_t: any, _tt: any, options: FetchOptions) => {
          const data = await graphsV1(CHAIN.AVAX)(_t, _tt, options);
          return {
            dailyFees: data.dailyVolume ? `${Number(data.dailyVolume) * TOTAL_FEES}` : "0",
            dailyUserFees: data.dailyVolume ? `${Number(data.dailyVolume) * TOTAL_FEES}` : "0",
            dailyRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * PROTOCOL_FEES}` : "0",
            dailyHoldersRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * HOLDER_REV}` : "0",
            dailySupplySideRevenue: data.dailyVolume ? `${Number(data.dailyVolume) * LP_FEE}` : "0",
            timestamp: options.startOfDay,
          };
        },
        start: '2022-11-26',
      },
    },
    v2: {
      [CHAIN.AVAX]: {
        fetch: graph,
        start: '2022-11-26',
      },
      [CHAIN.ARBITRUM]: {
        fetch: graph,
        start: '2022-12-26',
      },
      [CHAIN.BSC]: {
        fetch: graph,
        start: '2023-03-07',
      },
      // [CHAIN.ETHEREUM]: {
      //   fetch: graph,
      //   start: '2023-09-24',
      // },
    },
  },
};

export default adapter;
