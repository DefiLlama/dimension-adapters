import { CHAIN } from "../helpers/chains"
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"

const contract_address = '0xFAc9D58Cc823f75E0B275208FE69077e7a4CacaB'
const event_trade = 'event TradePlaced(bytes poolId,address sender,uint256 amount,string prediction,uint256 newTotal,bytes indexed indexedPoolId,address indexed indexedSender,string avatarUrl,string countryCode,int64 roundStartTime,string whiteLabelId)'

const fetchFees = async ({ createBalances, getLogs }: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = createBalances()

  let logs = await getLogs({ target: contract_address, eventAbi: event_trade, })

  logs.forEach((log: any) => {
    dailyFees.addGasToken(Number(log.amount) * 0.05)
  })

  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2023-08-10',
    }
  },
  methodology: {
    Fees: "Trading fees paid by users.",
    Revenue: "All fees are revenue.",
  }
}
export default adapters
