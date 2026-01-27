import { request, gql } from "graphql-request";
import { Chain } from "../../adapters/types";
import { getBlock } from "../../helpers/getBlock";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { FetchResult } from "../../adapters/types";


async function getChainData(
  url: string,
  timestamp: number,
  chain: Chain
): Promise<FetchResult> {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const fromTimestamp = dayTimestamp - 60 * 60 * 24;
  const todayBlock = (await getBlock(dayTimestamp, chain, {}))
  const yesterdayBlock = (await getBlock(fromTimestamp, chain, {}))
  const query = gql`
  {
      today: factories(first: 1, block:{number: ${todayBlock}}) {
        volumeUSD
        premiumsUSD
      }
      yesterday: factories(first: 1, block:{number: ${yesterdayBlock}}) {
        volumeUSD
        premiumsUSD
      }
  }
  `
  const  response :any = await request(url, query);
  const dailyPremiumVolume = (Number(response.today[0]?.premiumsUSD || '0') - Number(response.yesterday[0]?.premiumsUSD || '0')) / 1e18
  const dailyNotionalVolume = (Number(response.today[0]?.volumeUSD || '0') - Number(response.yesterday[0]?.volumeUSD || '0')) / 1e18

  return {
    timestamp,
    dailyNotionalVolume: dailyNotionalVolume < 0 ? undefined : dailyNotionalVolume,
    dailyPremiumVolume: dailyPremiumVolume < 0 ? undefined : dailyPremiumVolume,
  };
}

export default getChainData;
