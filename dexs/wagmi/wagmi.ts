import * as sdk from "@defillama/sdk";
// Wagmi data
import { CHAIN } from "../../helpers/chains";
const { request, gql } = require("graphql-request");
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getBlock } from "../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions } from "../../adapters/types";

export const LINKS: { [key: string]: any } = {
  [CHAIN.ERA]: {
    subgraph:
      "https://api.studio.thegraph.com/query/53494/wagmi-zksync-era/version/latest",
    blocks:
      "https://api.studio.thegraph.com/query/4540/zksync-era-blocks/v0.0.1",
  },
  [CHAIN.FANTOM]: {
    subgraph:
      "https://api.studio.thegraph.com/query/53494/v3-fantom/version/latest",
    blocks: sdk.graph.modifyEndpoint(
      "GxTjovT2QA2C4ycYHHVbxtepmMJuGL1tYvhBFLb7MZVj"
    ),
  },
  [CHAIN.KAVA]: {
    subgraph: "https://kava.graph.wagmi.com/subgraphs/name/v3",
    blocks: "https://kava.graph.wagmi.com/subgraphs/name/blocks",
  },
  [CHAIN.ETHEREUM]: {
    subgraph: "https://api.studio.thegraph.com/query/53494/v3/version/latest",
    blocks: sdk.graph.modifyEndpoint(
      "9A6bkprqEG2XsZUYJ5B2XXp6ymz9fNcn4tVPxMWDztYC"
    ),
  },
  [CHAIN.METIS]: {
    subgraph: "https://metis.graph.wagmi.com/subgraphs/name/v3",
    blocks: "https://metis.graph.wagmi.com/subgraphs/name/blocks",
  },
  [CHAIN.SONIC]: {
    subgraph: "https://sonic.graph.wagmi.com/subgraphs/name/v3",
    blocks: sdk.graph.modifyEndpoint(
      "6LJ3ThDWXaQrHGPL3KHFMcZiJpbKd1qSs9QAvgd9X89Z"
    ),
  },
};

interface IData {
  feesUSD: string;
  volumeUSD: string;
  totalVolumeUSD: string;
  totalFeesUSD: string;
  totalValueLockedUSD: string;
}
interface IGraph {
  uniswapDayData: IData;
  factories: IData[];
}
const getData = async (chain: Chain, timestamp: number) => {
  const block = await getBlock(timestamp, chain, {});
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400);
  // Get total volume
  const query = gql`{
    uniswapDayData(id: ${dateId}) {
      feesUSD
      volumeUSD
    }
    factories(first: 1, subgraphError: allow, block: { number: ${block} }) {
      txCount
      totalVolumeUSD
      totalFeesUSD
      totalValueLockedUSD
    }
  }
  `;

  const data: IGraph = await request(LINKS[chain].subgraph, query);

  const totalVolume = Number(data.factories[0].totalVolumeUSD);
  const totalFee = Number(data.factories[0].totalFeesUSD);

  const dailyVolume = Number(data.uniswapDayData?.volumeUSD ?? "0");
  const dailyFees = Number(data.uniswapDayData?.feesUSD ?? "0");

  return {
    dailyFees: `${dailyFees}`,
    totalFees: `${totalFee}`,
    dailyUserFees: `${dailyFees}`,
    totalUserFees: `${totalFee}`,
    totalVolume: `${totalVolume}`,
    dailyVolume: `${dailyVolume}`,
    timestamp: timestamp,
  };
};

export const fetchVolume = async (options: FetchOptions) => {
  const data = await getData(options.chain, options.startOfDay);
  return {
    totalVolume: data.totalVolume,
    dailyVolume: data.dailyVolume,
    timestamp: data.timestamp,
  };
};

export const fetchFee = (chain: string) => {
  return async (timestamp: number) => {
    const data = await getData(chain, timestamp);
    return {
      timestamp: data.timestamp,
      dailyFees: data.dailyFees,
      totalFees: data.totalFees,
      dailyUserFees: data.dailyUserFees,
      totalUserFees: data.totalUserFees,
    };
  };
};
