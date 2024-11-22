import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import ADDRESSES from '../helpers/coreAssets.json'

const fees: any = {
  [CHAIN.BASE]: ['0x9c3631dDE5c8316bE5B7554B0CcD2631C15a9A05'],
  [CHAIN.ETHEREUM]: [
    '0xa3d596eafab6b13ab18d40fae1a962700c84adea',
    '0x793e01dCf6F9759Bf26dd7869b03129e64217537',
    '0x4a4962275DF8C60a80d3a25faEc5AA7De116A746',
    '0xe900b3Edc1BA0430CFa9a204A1027B90825ac951',
    '0xed4811010a86f7c39134fbc20206d906ad1176b6',
    '0x13f37e6b638ca83e7090bb3722b3ae04bf884019',
    '0x99c9fc46f92e8a1c0dec1b1747d010903e884be1'
  ]
}
const fetchFees = async (options: FetchOptions) => {
  const { api, fromApi, createBalances } = options;
  await api.sumTokens({ owners: fees[options.chain], tokens: [ADDRESSES.null] })
  await fromApi.sumTokens({ owners: fees[options.chain], tokens: [ADDRESSES.null] })
  const balances = createBalances()
  balances.addBalances(api.getBalancesV2())
  balances.subtract(fromApi.getBalancesV2())
  const dailyFees = balances.clone()
  return {
    dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchFees,
          },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
          },
  }
}

export default adapter
