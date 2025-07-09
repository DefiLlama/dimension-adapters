import * as sdk from "@defillama/sdk";
import request from "graphql-request"
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getBlock } from "../../helpers/getBlock"

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

const fetchVolume = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();

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
  const result: IResponse = await request(sdk.graph.modifyEndpoint('BocqFij8hqUaDGmR1FpSuAYJmtqafZrFmBtHknP7kVd'), query)

  const dailyVolumeInEth = Number(result.today.totalVolumeInEth) - Number(result.yesterday.totalVolumeInEth)

  dailyVolume.addGasToken(dailyVolumeInEth)

  return {
    dailyVolume,
  }
}

const adapters: SimpleAdapter = {
  deadFrom: '2025-02-11',
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume,
      start: '2023-11-16'
      ,
    }
  }
}
export default adapters
