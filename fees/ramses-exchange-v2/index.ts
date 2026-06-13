import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fees_bribes } from './bribes';
import {
  DEFAULT_TOTAL_VOLUME_FIELD,
  getGraphDimensions2,
} from "../../helpers/getUniSubgraph"
import { METRIC } from "../../helpers/metrics";

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.ARBITRUM]: 1685574000,
}

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
    UserFees: 100, // User fees are 100% of collected fees
    Revenue: 80 // Revenue is 100% of collected fees
  }
});
// https://docs.ramses.exchange/ramses-cl-v2/concentrated-liquidity/fee-distribution
const methodology = {
  UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "Revenue going to the protocol. 5% of collected fees. (is probably right because the distribution is dynamic.)",
  HoldersRevenue: "User fees are distributed among holders. 75% of collected fees. (is probably right because the distribution is dynamic.)",
  SupplySideRevenue: "20% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by users",
    ['Bribes']: "Bribes paid by protocols"
  },
  Revenue: {
    ['Swap Fees to protocol']: "5% of swap fees go to the protocol treasury",
    ['Swap Fees to holders']: "75% of swap fees go to the holders",
    ['Bribes to holders']: "All the bribes go to the holders",
  },
  ProtocolRevenue: {
    ['Swap Fees to protocol']: "5% of swap fees go to the protocol treasury",
  },
  SupplySideRevenue: {
    ['Swap Fees to LPs']: "20% of swap fees go to the LPs",
  },
  HoldersRevenue: {
    ['Swap Fees to holders']: "75% of swap fees go to the holders",
    ['Bribes to holders']: "All the bribes go to the holders",
  },
}

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (options: FetchOptions) => {
        const v2Result = await v2Graphs(options)
        const bribesResult = await getBribes(options);
        v2Result.dailyBribesRevenue = bribesResult.dailyBribesRevenue;

        const dailyFees = options.createBalances();
        const dailyProtocolRevenue = options.createBalances();
        const dailySupplySideRevenue = options.createBalances();
        const dailyHoldersRevenue = options.createBalances();

        const bribeRevenue = Number(await bribesResult.dailyBribesRevenue.getUSDValue());

        dailyFees.addUSDValue(v2Result.dailyFees, METRIC.SWAP_FEES);
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
          dailyUserFees: dailyFees,
          dailyRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
          dailyHoldersRevenue,
        };
      },
      start: startTimeV2[CHAIN.ARBITRUM],
    },
  },
};

export default adapter;
