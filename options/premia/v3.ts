import { utils } from "ethers";
import { request, gql } from "graphql-request";

interface GqlResult {
  factoryDayDatas: Array<{
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
  timestamp: string;
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
  timestamp: string
): Promise<ChainData> {
  const { factoryDayDatas }: GqlResult = await request(url, chainDataQuery, {
    timestamp: timestamp,
  });

  const totalPremiumVolume = toNumber(factoryDayDatas[0].premiumsUSD);
  const dailyPremiumVolume = calcLast24hrsVolume(
    get2Days(factoryDayDatas, "premiumsUSD")
  );

  const totalNotionalVolume = toNumber(factoryDayDatas[0].volumeUSD);
  const dailyNotionalVolume = calcLast24hrsVolume(
    get2Days(factoryDayDatas, "volumeUSD")
  );

  return {
    timestamp,
    totalNotionalVolume,
    dailyNotionalVolume,
    totalPremiumVolume,
    dailyPremiumVolume,
  };
}

export default getChainData;
