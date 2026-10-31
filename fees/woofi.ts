import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from '../helpers/token';

// Fee wallets
const CONFIG: Record<string, string> = {
  [CHAIN.AVAX]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.BSC]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.POLYGON]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.ARBITRUM]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.OPTIMISM]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.BASE]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d'
}

const fetch = async (options: FetchOptions) => {
  const { api, chain } = options;
  const from = CONFIG[chain];
  const [token, rebateManager, treasury, vaultManager] = await Promise.all([
    api.call({ abi: 'address:quoteToken', target: from }),
    api.call({ abi: 'address:rebateManager', target: from }),
    api.call({ abi: 'address:treasury', target: from }),
    api.call({ abi: 'address:vaultManager', target: from }),
  ])
  const valutManagerFees = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [vaultManager] })
  const rebateManagerFees = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [rebateManager] })
  const treasuryFees = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [treasury] })

  const dailyFees = valutManagerFees.clone()
  const dailyRevenue = valutManagerFees.clone()
  const dailyHoldersRevenue = valutManagerFees.clone()
  const dailyProtocolRevenue = treasuryFees.clone()
  dailyFees.addBalances(rebateManagerFees)
  dailyFees.addBalances(treasuryFees)
  dailyRevenue.addBalances(treasuryFees)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2023-01-09',
    }
  }
}

export default adapter;
