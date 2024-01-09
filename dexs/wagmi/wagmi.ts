// Wagmi data
import { CHAIN } from "../../helpers/chains";
const { request, gql } = require("graphql-request");
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getBlock } from "../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

export const LINKS: { [key: string]: any } = {
  [CHAIN.ERA]: {
    subgraph:
      "https://api.studio.thegraph.com/query/4540/wagmi-zksync-era/version/latest",
    blocks:
      "https://api.studio.thegraph.com/query/4540/zksync-era-blocks/v0.0.1",
  },
  [CHAIN.FANTOM]: {
    subgraph:
      "https://api.thegraph.com/subgraphs/name/0xfantaholic/wagmi-fantom",
    blocks:
      "https://api.thegraph.com/subgraphs/name/beethovenxfi/fantom-blocks",
  },
  [CHAIN.KAVA]: {
    subgraph: "https://kava.graph.wagmi.com/subgraphs/name/v3",
    blocks: "https://kava.graph.wagmi.com/subgraphs/name/blocks",
  },
  [CHAIN.ETHEREUM]: {
    subgraph: "https://api.studio.thegraph.com/query/53494/v3/version/latest",
    blocks:
      "https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks",
  },
  [CHAIN.METIS]: {
    subgraph: "https://metis.graph.wagmi.com/subgraphs/name/v3",
    blocks: "https://metis.graph.wagmi.com/subgraphs/name/blocks",
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

  const dailyVolume = Number(data.uniswapDayData.volumeUSD);
  const dailyFees = Number(data.uniswapDayData.feesUSD);

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

export const fetchVolume = (chain: string) => {
  return async (timestamp: number) => {
    const data = await getData(chain, timestamp);

    return {
      totalVolume: data.totalVolume,
      dailyVolume: data.dailyVolume,
      timestamp: data.timestamp,
    };
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
