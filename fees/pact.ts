import { Adapter, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import fetchURL from "../utils/fetchURL"

interface IAPIResponse {
  fee_usd_24h: string
  tvl_usd: string
  volume_24h_usd: string
}
const url = 'https://api.pact.fi/api/internal/pools_details/all'
const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const response = (await fetchURL(url)).map((e: any) => { return { fee_usd_24h: e.fee_usd_24h, tvl_usd: e.tvl_usd, volume_24h_usd: e.volume_24h_usd } }) as IAPIResponse[]
  const filtered = response.filter((p: IAPIResponse) => {
    const isWashTrading = +p.tvl_usd < 1_000_000 && +p.volume_24h_usd > 10 * +p.tvl_usd
    return !isWashTrading
  })
  const dailyFees = filtered.reduce((acc: number, curr: IAPIResponse) => acc + Number(curr.fee_usd_24h), 0)
  return {
    dailyFees,
    timestamp
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ALGORAND]: {
      fetch: fetchFees,
      start: '2023-09-03',
      runAtCurrTime: true
    }
  }
}

export default adapters
