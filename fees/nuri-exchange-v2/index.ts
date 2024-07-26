import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fees_bribes } from './bribes';
import {
  getGraphDimensions,
  DEFAULT_DAILY_VOLUME_FACTORY,
  DEFAULT_TOTAL_VOLUME_FIELD,
} from "../../helpers/getUniSubgraph"
import { Chain } from "@defillama/sdk/build/types";
import { getBlock } from "@defillama/sdk/build/util/blocks";
import { Balances } from "@defillama/sdk";

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.SCROLL]: 1714608000,
}

const getBribes = async (chain: Chain, timestamp: number): Promise<any> => {
  const fromTimestamp = timestamp - 24 * 60 * 60 
  const fromBlock = await getBlock(chain, fromTimestamp)
  const bribes_delta: Balances = new Balances({})
  const bribes: Balances = new Balances({})
  await fees_bribes(fromBlock.block, timestamp, bribes_delta);
  await fees_bribes(fromBlock.block, fromTimestamp, bribes);
  bribes.subtract(bribes_delta);
  return {
    timestamp,
    dailyBribesRevenue: bribes,
  };
};

const v2Endpoints = {
  [CHAIN.SCROLL]: "https://api.studio.thegraph.com/query/66247/nuri-cl/version/latest",
};

const VOLUME_USD = "volumeUSD";

const v2Graphs = getGraphDimensions({
  graphUrls: v2Endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
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
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol. 8% of collected fees. (is probably right because the distribution is dynamic.)",
  HoldersRevenue: "User fees are distributed among holders. 72% of collected fees. (is probably right because the distribution is dynamic.)",
  SupplySideRevenue: "20% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)"
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: async (timestamp, chainBlocks) => {
        const v2Result = await v2Graphs(CHAIN.SCROLL)(timestamp, chainBlocks)
        const bribesResult = await getBribes(CHAIN.SCROLL, timestamp);
        v2Result.dailyBribesRevenue = bribesResult.dailyBribesRevenue;

        return v2Result;
      },
      start: startTimeV2[CHAIN.SCROLL],
      meta: {
        methodology: {
          ...methodology,
          UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
        },
      },
    },
  },
};

export default adapter;
