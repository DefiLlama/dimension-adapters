import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"

// https://solscan.io/account/8tA49tvPiTCkeVfuTms1F2nwVg6FWpQsQ8eNZ4g9vVQF

// https://solscan.io/account/AEBoqzQU3fDYzhVmaRedcNeVcQQSMEqCAuQ2A7pYNEd7


const fetchFees = async (options: FetchOptions) => {
  const targets = [
    '8tA49tvPiTCkeVfuTms1F2nwVg6FWpQsQ8eNZ4g9vVQF',
    'AEBoqzQU3fDYzhVmaRedcNeVcQQSMEqCAuQ2A7pYNEd7',
    '4KRS8BPCgDZHBTXkugCHuh2ZsZQhmAbdx6ASjMQYNdXd'
  ]
  const dailyFees = await getSolanaReceived({ options, targets: targets })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: 1663113600,
    }
  }
}

export default adapters
