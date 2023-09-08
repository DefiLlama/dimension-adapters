import { utils } from "ethers";
import { request, gql } from "graphql-request";

interface GqlResult {
  factoryDayData: {
    volumeUSD: string;
    premiumsUSD: string;
  };
  factories: Array<{
    volumeUSD: string;
    premiumsUSD: string;
  }>;
}

const chainDataQuery = gql`
  query FeeAndVolumeQuery($timestamp: Int) {
    factoryDayDatas(
      first: 2
      orderDirection: desc
      orderBy: periodStart
      where: { periodStart_lte: $timestamp }
    ) {
      volumeUSD
      premiumsUSD
    }
  }
`;

interface ChainData {
  totalPremiumVolume: number;
  dailyPremiumVolume: number;
  totalNotionalVolume: number;
  dailyNotionalVolume: number;
  timestamp: number;
}

function get2Days(array: Array<any>, key: string): [string, string] {
  if (!Array.isArray(array) || array.length < 2) return ["0", "0"];
  return array.slice(0, 2).map((obj) => obj[key]) as [string, string];
}

function toNumber(value: string): number {
  return Number(utils.formatEther(value));
}

function calcLast24hrsVolume(values: [string, string]): number {
  return toNumber(values[0]) - toNumber(values[1]);
}

async function getChainData(
  url: string,
  timestamp: number
): Promise<ChainData> {
  const dailyId = Math.floor(timestamp / 86400);
  const query = gql`
  {
      factoryDayData(id: ${dailyId}) {
        volumeUSD
        premiumsUSD
      }
      factories{
        volumeUSD
        premiumsUSD
      }
  }
  `
  const { factoryDayData, factories }: GqlResult = await request(url, query);
  const dailyPremiumVolume = toNumber(factoryDayData?.premiumsUSD || '0');
  const dailyNotionalVolume = toNumber(factoryDayData?.volumeUSD || '0');
  const totalPremiumVolume = toNumber(factories[0]?.premiumsUSD || '0');
  const totalNotionalVolume = toNumber(factories[0]?.volumeUSD || '0');

  return {
    timestamp,
    totalNotionalVolume,
    dailyNotionalVolume,
    totalPremiumVolume,
    dailyPremiumVolume,
  };
}

export default getChainData;
