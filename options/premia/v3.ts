import { request, gql } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import { getBlock } from "../../helpers/getBlock";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { ethers } from "ethers";
import { FetchResult } from "../../adapters/types";
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


async function getChainData(
  url: string,
  timestamp: number,
  chain: Chain
): Promise<FetchResult> {
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
  const dailyPremiumVolume = (Number(response.today?.premiumsUSD || '0') - Number(response.yesterday?.premiumsUSD || '0')) / 1e18
  const dailyNotionalVolume = (Number(response.today?.volumeUSD || '0') - Number(response.yesterday?.volumeUSD || '0')) / 1e18
  const totalPremiumVolume = (Number(response.factories[0]?.premiumsUSD || '0')) / 1e18
  const totalNotionalVolume = (Number(response.factories[0]?.volumeUSD || '0')) / 1e18

  return {
    timestamp,
    totalNotionalVolume,
    dailyNotionalVolume: dailyNotionalVolume < 0 ? undefined : dailyNotionalVolume,
    totalPremiumVolume,
    dailyPremiumVolume: dailyPremiumVolume < 0 ? undefined : dailyPremiumVolume,
  };
}

export default getChainData;
