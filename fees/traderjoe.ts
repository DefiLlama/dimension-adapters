import { Adapter, FetchOptions } from "../adapters/types";
import { Chain } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import { httpGet } from "../utils/fetchURL";

interface IData {
  feesUsd: number;
  protocolFeesUsd: number;
  timestamp: number;
}

const graph = async (_t: any, _tt: any, options: FetchOptions) => {
    const dayTimestamp = options.startOfDay;
    const start = options.startOfDay;
    const end = start + 24 * 60 * 60;
      const url = `https://api.traderjoexyz.dev/v1/dex/analytics/${mapChain(options.chain)}?startTime=${start}&endTime=${end}`
    const historical: IData[] = (await httpGet(url, { headers: {
      'x-traderjoe-api-key': getEnv('TRADERJOE_API_KEY')
    }}));
    const dailyFees =
      historical.find((dayItem) => dayItem.timestamp === dayTimestamp)
        ?.feesUsd || 0;
    const dailyRevenue =
      historical.find((dayItem) => dayItem.timestamp === dayTimestamp)
        ?.protocolFeesUsd || 0;
    return {
      dailyUserFees: dailyFees,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue: dailyFees
        ? `${(dailyFees || 0) - (dailyRevenue || 0)}`
        : undefined,
      dailyProtocolRevenue: dailyRevenue,
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
    v2: {
      [CHAIN.AVAX]: {
        fetch: graph,
        start: '2022-11-26',
      },
      [CHAIN.ARBITRUM]: {
        fetch: graph,
        start: '2022-12-26',
      },
      // [CHAIN.BSC]: {
      //   fetch: graph,
      //   start: '2023-03-07',
      // },
      // [CHAIN.ETHEREUM]: {
      //   fetch: graph,
      //   start: '2023-09-24',
      // },
    },
  },
};

export default adapter;
