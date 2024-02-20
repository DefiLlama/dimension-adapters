import fetchURL from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import BigNumber from "bignumber.js"

const fetch = async (): Promise<FetchResult> => {
  // Amounts in SOL lamports
  const amounts = (await fetchURL('https://stats-api.marinade.finance/v1/integrations/defillama/fees')).liquid

  const coin = 'solana:So11111111111111111111111111111111111111112'
  const priceResponse = await fetchURL(`https://coins.llama.fi/prices/current/${coin}`)
  const price = priceResponse.coins[coin].price
  const decimals = Math.pow(10, priceResponse.coins[coin].decimals)

  return {
    timestamp: new Date().getTime() / 1000,
    totalFees: new BigNumber(amounts.totalFees).multipliedBy(price).dividedBy(decimals).toString(),
    dailyFees: new BigNumber(amounts.dailyFees).multipliedBy(price).dividedBy(decimals).toString(),
    dailyUserFees: new BigNumber(amounts.dailyUserFees).multipliedBy(price).dividedBy(decimals).toString(),
    totalRevenue: new BigNumber(amounts.totalRevenue).multipliedBy(price).dividedBy(decimals).toString(),
    dailyRevenue: new BigNumber(amounts.dailyRevenue).multipliedBy(price).dividedBy(decimals).toString(),
    dailyProtocolRevenue: new BigNumber(amounts.dailyProtocolRevenue).multipliedBy(price).dividedBy(decimals).toString(),
    dailySupplySideRevenue: new BigNumber(amounts.dailySupplySideRevenue).multipliedBy(price).dividedBy(decimals).toString(),
    totalProtocolRevenue: new BigNumber(amounts.totalProtocolRevenue).multipliedBy(price).dividedBy(decimals).toString(),
    totalSupplySideRevenue: new BigNumber(amounts.totalSupplySideRevenue).multipliedBy(price).dividedBy(decimals).toString(),
    totalUserFees: new BigNumber(amounts.totalUserFees).multipliedBy(price).dividedBy(decimals).toString(),
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: 1689120000, // 2023-07-12T00:00:00Z
      runAtCurrTime: true,
      meta: {
        methodology: {
          // https://docs.llama.fi/list-your-project/other-dashboards/dimensions
          UserFees: 'Marinade management fee 6% on staking rewards',
          Fees: 'Staking rewards',
          Revenue: ' = ProtocolRevenue',
          ProtocolRevenue: ' = UserFees',
          SupplySideRevenue: 'Stakers revenue = Fees - UserFees'
        },
        hallmarks:[
          [1667865600, 'FTX collapse'],
        ],
      },
    },
  },
}
export default adapter
