import { Adapter, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import fetchURL from "../utils/fetchURL"

interface IAPIResponse {
  fee_usd_24h: string
}
const url = 'https://api.pact.fi/api/internal/pools_details/all'
const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const response = (await fetchURL(url)).map((e: any) => { return {fee_usd_24h: e.fee_usd_24h}}) as IAPIResponse[]
  const dailyFees = response.reduce((a: number, b: IAPIResponse) => a + Number(b.fee_usd_24h), 0)
  return {
    dailyFees,
    timestamp
  }
}

const adapters: SimpleAdapter = {
  adapter:{
    [CHAIN.ALGORAND]: {
      fetch: fetchFees,
      start: '2023-09-03',
      runAtCurrTime: true
    }
  }
}

export default adapters
