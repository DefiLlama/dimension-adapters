import { ethers } from "ethers";
import { request, gql } from "graphql-request";

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

interface ChainData {
  dailyPremiumVolume: number;
  dailyNotionalVolume: number;
  timestamp: string;
}

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

async function getChainData(
  url: string,
  timestamp: string
): Promise<ChainData> {
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

export default getChainData;
