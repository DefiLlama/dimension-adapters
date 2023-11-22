// Wagmi data
import { CHAIN } from "../../helpers/chains";
const { request, gql } = require("graphql-request");

export const LINKS: { [key: string]: any } = {
  [CHAIN.ERA]: {
    subgraph:
      "https://api.studio.thegraph.com/query/4540/wagmi-zksync-era/version/latest",
    blocks: "https://api.studio.thegraph.com/query/4540/zksync-era-blocks/v0.0.1",
  },
  [CHAIN.FANTOM]: {
    subgraph:
      "https://api.thegraph.com/subgraphs/name/0xfantaholic/wagmi-fantom",
    blocks: "https://api.thegraph.com/subgraphs/name/beethovenxfi/fantom-blocks",
  },
  [CHAIN.KAVA]: {
    subgraph:
      "https://kava.graph.wagmi.com/subgraphs/name/v3",
    blocks: "https://kava.graph.wagmi.com/subgraphs/name/blocks",
  },
};

const ONE_DAY_UNIX = 24 * 60 * 60; // 1 day in seconds

const getData = async (chain: string) => {
  const todayTimestamp = Math.floor(new Date().getTime() / 1000);
  const blockTimestamp =  todayTimestamp - ONE_DAY_UNIX;

  const block = await getBlock(chain, blockTimestamp)

  // Get total volume
  const query = gql`query uniswapFactories {
    factories(first: 1, subgraphError: allow) {
      txCount
      totalVolumeUSD
      totalFeesUSD
      totalValueLockedUSD
    }
  }`;

  const query24 = gql`query uniswapFactories {
    factories(first: 1, subgraphError: allow, block: { number: ${block} }) {
      txCount
      totalVolumeUSD
      totalFeesUSD
      totalValueLockedUSD
    }
  }`;

  const data = await request(LINKS[chain].subgraph, query);
  const { totalVolumeUSD, totalFeesUSD } = data.factories[0];

  const data24 = await request(LINKS[chain].subgraph, query24);
  const { totalVolumeUSD: dayVolume, totalFeesUSD: dayFees } = data24.factories[0];

  const totalSum = Number(totalVolumeUSD);
  const totalFee = Number(totalFeesUSD);

  const daySum = totalSum - Number(dayVolume);
  const dayFee = totalFee - Number(dayFees);

  return {
    dailyFees: `${dayFee}`,
    totalFees: `${totalFee}`,
    dailyUserFees: `${dayFee}`,
    totalUserFees: `${totalFee}`,
    totalVolume: `${totalSum}`,
    dailyVolume: `${daySum}`,
    timestamp: todayTimestamp,
  };
};

export const fetchVolume = (chain: string) => {
  return async () => {
    const data = await getData(chain);

    return {
      totalVolume: data.totalVolume,
      dailyVolume: data.dailyVolume,
      timestamp: data.timestamp,
    };
  };
};

export const fetchFee = (chain: string) => {
  return async () => {
    const data = await getData(chain);

    return {
      timestamp: data.timestamp,
      dailyFees: data.dailyFees,
      totalFees: data.totalFees,
      dailyUserFees: data.dailyUserFees,
      totalUserFees: data.totalUserFees,
    };
  };
};

const getBlock = async (chain: string, timestamp: string | number) => {
  const blockQuery = gql`query blocks {
    blocks(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_gt: ${timestamp}, timestamp_lt: ${
    Number(timestamp) + 600
  } }) {
      number
    }
  }`

  const { blocks: data } = await request(LINKS[chain].blocks, blockQuery)

  return data[0].number ?? undefined
}