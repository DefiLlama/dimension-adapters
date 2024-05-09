import { request, gql } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../../helpers/getBlock";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { ethers } from "ethers";
interface GqlResult {
  today: {
    volumeUSD: string;
    premiumsUSD: string;
  };
  yesterday: {
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
  return Number(ethers.formatEther(value));
}

function calcLast24hrsVolume(values: [string, string]): number {
  return toNumber(values[0]) - toNumber(values[1]);
}

async function getChainData(
  url: string,
  timestamp: number,
  chain: Chain
): Promise<ChainData> {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const fromTimestamp = dayTimestamp - 60 * 60 * 24;
  const dailyId = Math.floor(dayTimestamp / 86400);
  const yesterdayId = Math.floor(fromTimestamp / 86400);
  const block = (await getBlock(fromTimestamp,chain, {}))
  const query = gql`
  {
      today:factoryDayData(id: ${dailyId}) {
        volumeUSD
        premiumsUSD
      }
      yesterday:factoryDayData(id: ${yesterdayId}) {
        volumeUSD
        premiumsUSD
      }
      factories(block:{number: ${block}}) {
        volumeUSD
        premiumsUSD
      }
  }
  `
  const  response :GqlResult = await request(url, query);
  const dailyPremiumVolume = Math.abs(toNumber(response.today?.premiumsUSD || '0') - toNumber(response.yesterday?.premiumsUSD || '0'));
  const dailyNotionalVolume = Math.abs(toNumber(response.today?.volumeUSD || '0') - toNumber(response.yesterday?.volumeUSD || '0'));
  const totalPremiumVolume = Math.abs(toNumber(response.factories[0]?.premiumsUSD || '0'));
  const totalNotionalVolume = Math.abs(toNumber(response.factories[0]?.volumeUSD || '0'));

  return {
    timestamp,
    totalNotionalVolume,
    dailyNotionalVolume,
    totalPremiumVolume,
    dailyPremiumVolume,
  };
}

export default getChainData;
