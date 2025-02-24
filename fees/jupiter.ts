import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDune } from "../helpers/dune"
import { getSolanaReceived } from "../helpers/token"


interface IData  {
  fee_usd: string;
}

const fethcFeesSolana = async (options: FetchOptions) => {
  // limit order fees
  const dailyFees = await getSolanaReceived({ options, targets: [
    'jupoNjAxXgZ4rjzxzPMP4oxduvQsQtZzyknqvzYNrNu'
    ,'27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc'
  ]})
  // ultra fees
  const data: IData[] = await queryDune("4769928", {
    start: options.startTimestamp,
    end: options.endTimestamp
  })

  const dailyFeesUltra = options.createBalances()
  data.forEach((item) => {
    dailyFeesUltra.addUSDValue(item.fee_usd)
  })
  const dailyRevenue = dailyFees.clone()
  dailyFees.addBalances(dailyFeesUltra)
  dailyFeesUltra.resizeBy(0.5)
  dailyRevenue.addBalances(dailyFeesUltra)
  return { dailyFees, dailyRevenue: dailyRevenue }
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: '2023-06-01',
    },
  },
  isExpensiveAdapter: true,
}

export default adapter
