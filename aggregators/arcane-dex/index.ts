import * as sdk from "@defillama/sdk";
import ADDRESSES from '../../helpers/coreAssets.json'

import request from "graphql-request"
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types"
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
  const result: IResponse = await request(sdk.graph.modifyEndpoint('BocqFij8hqUaDGmR1FpSuAYJmtqafZrFmBtHknP7kVd'), query)
  const ethAddress = "ethereum:" + ADDRESSES.null;

  const dailyVolumeInEth = Number(result.today.totalVolumeInEth) - Number(result.yesterday.totalVolumeInEth)
  const totalVolumeInEth = Number(result.today.totalVolumeInEth)
  return {
    dailyVolume: await sdk.Balances.getUSDString({ [ethAddress]: dailyVolumeInEth }, timestamp),
    totalVolume: await sdk.Balances.getUSDString({ [ethAddress]: totalVolumeInEth }, timestamp),
    timestamp,
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume,
      start: '2023-11-16'
      ,
    }
  }
}
export default adapters
