import request from "graphql-request"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"

const url = 'https://api.goldsky.com/api/public/project_clxa80jhk286401wr744n680a/subgraphs/launchpad-swap/v1.0.0/gn'
interface IPairTrade {
  type: string
  timestamp: number
  valueUSD: number

}

const fetchData = async (timestamp: any, _b: any, options: FetchOptions) => {
  if (timestamp > 1742860800) return {}
  const querry = `
    {
      pairTrades(where:{timestamp_gte: ${options.startOfDay}, timestamp_lte:${options.startOfDay + 86400}}) {
        type
        timestamp
        valueUSD
        timestamp
      }
    }
  `
  const respose: IPairTrade[] = (await request(url, querry)).pairTrades as IPairTrade[]
  const dailyVolume = options.createBalances();
  respose.forEach((trade) => {
    dailyVolume.addUSDValue(Number(trade.valueUSD))
  })
  const dailyFees = dailyVolume.clone();
  dailyFees.resizeBy(0.5/100)

  return {
    timestamp: timestamp,
    dailyVolume: dailyVolume,
    dailyFees,
  }
}

const adapter: SimpleAdapter = {
  deadFrom: "2025-03-25",
  adapter: {
    artela: {
      fetch: fetchData,
    }
  }
}


export default adapter
