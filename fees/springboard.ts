import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const address = '0x5c952063c7fc8610FFDB798152D69F0B9550762b'
const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  await options.api.sumTokens({ owners: [address], tokens: ["0x0000000000000000000000000000000000000000"] })
  await options.fromApi.sumTokens({ owners: [address], tokens: ["0x0000000000000000000000000000000000000000"] })
  dailyFees.addBalances(options.api.getBalancesV2())
  dailyFees.subtract(options.fromApi.getBalancesV2())
  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: '2024-11-05',
    }
  }
}
export default adapter
