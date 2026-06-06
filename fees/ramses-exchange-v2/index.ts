import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fees_bribes } from './bribes';
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../../helpers/getUniSubgraph"
import { METRIC } from "../../helpers/metrics";
import { breakdownMethodology, createPoolFetchHandler, methodology } from "../../dexs/ramses-hl-cl";

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1685574000,
}
const arbitrumCutover = Date.UTC(2026, 0, 13) / 1000;
const currentFetch = createPoolFetchHandler('cl');
const fetchCurrent = (options: FetchOptions) => currentFetch(undefined, undefined, options);

const getBribes = async ({ fromTimestamp, toTimestamp, createBalances, getFromBlock, }: FetchOptions): Promise<any> => {
  const fromBlock = await getFromBlock()
  const bribes = createBalances();
  const bribes_delta = createBalances();
  await fees_bribes(fromBlock, toTimestamp, bribes_delta);
  await fees_bribes(fromBlock, fromTimestamp, bribes);
  bribes.subtract(bribes_delta);
  return {
    timestamp: toTimestamp,
    dailyBribesRevenue: bribes,
  };
};

const v2Endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('ATQTt3wRTgXy4canCh6t1yeczAz4ZuEkFQL2mrLXEMyQ'),
};

const v2Graphs = getGraphDimensions2({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  feesPercent: {
    type: "fees",
    HoldersRevenue: 72,
    ProtocolRevenue: 8,
    SupplySideRevenue: 20,
    UserFees: 100,
    Revenue: 80,
  }
});
const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (options: FetchOptions) => {
        if (options.startOfDay >= arbitrumCutover) return fetchCurrent(options);

        const v2Result = await v2Graphs(options)
        const bribesResult = await getBribes(options);
        const dailyFees = options.createBalances();
        const dailyUserFees = options.createBalances();
        const dailyProtocolRevenue = options.createBalances();
        const dailySupplySideRevenue = options.createBalances();
        const dailyHoldersRevenue = options.createBalances();

        const bribeRevenue = Number(await bribesResult.dailyBribesRevenue.getUSDValue());

        dailyFees.addUSDValue(v2Result.dailyFees, METRIC.SWAP_FEES);
        dailyUserFees.addUSDValue(v2Result.dailyFees, METRIC.SWAP_FEES);
        dailyFees.addUSDValue(bribeRevenue, 'Bribes');

        dailyHoldersRevenue.addUSDValue(Number(v2Result.dailyHoldersRevenue), 'Swap Fees to holders');
        dailyProtocolRevenue.addUSDValue(Number(v2Result.dailyProtocolRevenue), 'Swap Fees to protocol');
        dailySupplySideRevenue.addUSDValue(Number(v2Result.dailySupplySideRevenue), 'Swap Fees to LPs');

        dailyHoldersRevenue.addUSDValue(bribeRevenue, 'Bribes to holders');

        const dailyRevenue = dailyHoldersRevenue.clone();
        dailyRevenue.add(dailyProtocolRevenue);

        return {
          dailyVolume: v2Result.dailyVolume,
          dailyFees,
          dailyUserFees,
          dailyRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
          dailyHoldersRevenue,
        };
      },
      start: startTimeV2[CHAIN.ARBITRUM],
    },
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchCurrent,
      start: '2025-11-08',
    },
    [CHAIN.POLYGON]: {
      fetch: fetchCurrent,
      start: '2026-01-28',
    },
  },
};

export default adapter;
