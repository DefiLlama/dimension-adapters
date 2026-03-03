import * as sdk from "@defillama/sdk";
import { SimpleAdapter, ChainEndpoints } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { ethers } from "ethers";

const v2Endpoints: ChainEndpoints = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('CqWfkgRsJRrQ5vWq9tkEr68F5nvbAg63ati5SVJQLjK8'),
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('3o6rxHKuXZdy8jFifV99gMUe8FaVUL8w8bDTNdc4zyYg'),
  [CHAIN.FANTOM]:
    sdk.graph.modifyEndpoint('5ahtXN7DVTwnPuDhWqgJWvEeAEP3JD7h2kD1Kpe67VuW'),
  [CHAIN.OPTIMISM]:
    sdk.graph.modifyEndpoint('8wMexS8BB1cXWYu2V8cPHURGXSRGDBhshnU9nTiSkXQ7'),
}

const v2StartTimes: { [chain: string]: number } = {
  [CHAIN.ETHEREUM]: 1656201600,
  [CHAIN.ARBITRUM]: 1656201600,
  [CHAIN.FANTOM]: 1656201600,
  [CHAIN.OPTIMISM]: 1659744000,
}

interface GqlResult {
  totalPremiumsDailies: Array<{
    id: string;
    timestamp: string;
    totalPremiumsInUsd: string;
  }>;
  totalVolumes: [{ totalVolumeInUsd: string }];
  totalVolumeDailies: Array<{
    id: string;
    timestamp: string;
    totalVolumeInUsd: string;
  }>;
}

const chainDataQuery = gql`
  query feeAndVolumeQuery($timestamp: Int) {
    totalVolumes {
      totalVolumeInUsd
    }
    totalPremiumsDailies(
      first: 3
      orderDirection: desc
      orderBy: timestamp
      where: { timestamp_lte: $timestamp }
    ) {
      id
      timestamp
      totalPremiumsInUsd
    }
    totalVolumeDailies(
      first: 3
      orderDirection: desc
      orderBy: timestamp
      where: { timestamp_lte: $timestamp }
    ) {
      id
      timestamp
      totalVolumeInUsd
    }
  }
`;

function get2Days(array: Array<any>, key: string): [string, string] {
  if (!Array.isArray(array) || array.length <= 2) return ["0", "0"];
  return array.slice(1, 3).map((obj) => obj[key]) as [string, string];
}

function toNumber(value: string): number {
  return Number(ethers.formatEther(value));
}

function calcLast24hrsVolume(values: [string, string]): number {
  return toNumber(values[0]) - toNumber(values[1]);
}

async function getV2Data(url: string, timestamp: string) {
  const { totalPremiumsDailies, totalVolumeDailies }: GqlResult =
    await request(url, chainDataQuery, {
      timestamp: timestamp,
    });

  const dailyPremiumVolume = calcLast24hrsVolume(
    get2Days(totalPremiumsDailies, "totalPremiumsInUsd")
  );

  const dailyNotionalVolume = calcLast24hrsVolume(
    get2Days(totalVolumeDailies, "totalVolumeInUsd")
  );

  return {
    timestamp,
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

const adapter: SimpleAdapter = {
  methodology: {
    UserFees:
      "Traders pay taker fees on each trade up to 3% of the option premium.",
    ProtocolRevenue: "The protocol collects 20% of the taker fees.",
    SupplySideRevenue:
      "Liquidity providers earn revenue from market-making options.",
    HoldersRevenue: "vxPREMIA holders collect 80% of the taker fees.",
  },
  adapter: Object.keys(v2Endpoints).reduce((acc: any, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (ts: string) => await getV2Data(v2Endpoints[chain], ts),
        start: v2StartTimes[chain],
      },
    }
  }, {}),
}

export default adapter
