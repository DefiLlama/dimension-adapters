import { SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import fetchURL from '../utils/fetchURL'

const fetch = async (_: any) => {
  const data = await fetchURL('https://api.orderly.org/v1/public/futures')

  const openInterestAtEnd = data.data.rows.reduce(
    (acc: number, market: any) => {
      return (
        acc + Number(market.open_interest || 0) * Number(market.mark_price || 0)
      )
    },
    0
  )

  return {
    openInterestAtEnd: openInterestAtEnd,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ORDERLY],
  runAtCurrTime: true,
  start: '2025-10-20',
}

export default adapter
