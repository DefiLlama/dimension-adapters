import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addGasTokensReceived } from '../../helpers/token';

const feeReceiverMultisig = [
  "0x87D30c1a5a79b060d7F6FBEa7791c381a2aFc7Ad"
]

const fromAddresses = [
  "0x20be1319c5604d272fb828a9dccd38487e973cb8"
]

const fetch = async (options: FetchOptions) => {
  let dailyVolume = options.createBalances()

  await addGasTokensReceived({ multisigs: feeReceiverMultisig, balances: dailyVolume, options, fromAddresses })
  dailyVolume = dailyVolume.resizeBy(100) // because of 1% fixed platform fee as per docs

  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2025-07-15'
    },
    
  },
}

export default adapter
