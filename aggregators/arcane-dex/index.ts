
import request from "graphql-request"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getBlock } from "../../helpers/getBlock"
import { getPrices } from "../../utils/prices";

interface IResponse {
  today: {
    totalSwaps: string;
    id: string;
    totalVolumeInEth: string;
  };
  yesterday: {
    totalSwaps: string;
    id: string;
    totalVolumeInEth: string;
  };
}

const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const toBlock = await getBlock(toTimestamp, CHAIN.ARBITRUM, {})
  const fromBlock = await getBlock(fromTimestamp, CHAIN.ARBITRUM, {})
  const query = `
  {
      today:globalStat(id:"global_stats", block:{number:${toBlock}}) {
        totalSwaps
        id
        totalVolumeInEth
      }
      yesterday:globalStat(id:"global_stats", block:{number:${fromBlock}}) {
        totalSwaps
        id
        totalVolumeInEth
      }
  }
  `
  const result: IResponse = await request("https://api.thegraph.com/subgraphs/name/0xandee/arcanedex", query)
  const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
  const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;

  const dailyVolumeInEth = Number(result.today.totalVolumeInEth) - Number(result.yesterday.totalVolumeInEth)
  const totalVolumeInEth = Number(result.today.totalVolumeInEth)
  const dailyVolume = (dailyVolumeInEth / 1e18) * ethPrice;
  const totalVolume = (totalVolumeInEth / 1e18) * ethPrice;
  return {
    dailyVolume: dailyVolume.toString(),
    totalVolume: totalVolume.toString(),
    timestamp,
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume,
      start: async () => 1700092800
      ,
    }
  }
}
export default adapters
