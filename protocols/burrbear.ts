import request from "graphql-request"
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const url = 'https://api.goldsky.com/api/public/project_clq1h5ct0g4a201x18tfte5iv/subgraphs/bgt-subgraph/v1000000/gn'


interface IProtocolData {
    volumeUsd: number
    feesUsd: number
}
const fetchVolume = async (options: FetchOptions) => {
  const querry = `
    {
        poolDayDatas(where: {date_gte: ${options.startTimestamp}, date_lt: ${options.endTimestamp}}) {
            date
            volumeUsd
            feesUsd
        }
    }`

  const respose = (await request(url, querry)).poolDayDatas as IProtocolData[]

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(Number(respose.reduce((acc, item) => acc + Number(item.volumeUsd), 0)))
  const dailyFees = dailyVolume.clone();
  dailyFees.addUSDValue(Number(respose.reduce((acc, item) => acc + Number(item.feesUsd), 0)))
  return {
    dailyVolume: dailyVolume,
    dailyFees: dailyFees,
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: fetchVolume
    }
  }
}

export default adapters
