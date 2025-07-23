import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from '../helpers/token';

// Fee wallets
const CONFIG: Record<string, string> = {
  [CHAIN.AVAX]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.BSC]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.FANTOM]: '0x0b5025d8d409a51615cb624b8ede132bb11a2550',
  [CHAIN.POLYGON]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.ARBITRUM]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.OPTIMISM]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.ERA]: '0x01b50b57a3d3c1a54433813585e60713e75f3de9',
  [CHAIN.LINEA]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.BASE]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.MANTLE]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  [CHAIN.SONIC]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d'
}

const fetch = async (options: FetchOptions) => {
  const { api, chain } = options;
  const from = CONFIG[chain];
  const token = await api.call({ abi: 'address:quoteToken', target: from })
  const rebateManager = await api.call({ abi: 'address:rebateManager', target: from })
  const treasury = await api.call({ abi: 'address:treasury', target: from })
  const vaultManager = await api.call({ abi: 'address:vaultManager', target: from })
  const valutManagerFees = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [vaultManager] })
  const rebateManagerFees = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [rebateManager] })
  const treasuryFees = await addTokensReceived({ fromAddressFilter: from, options, tokens: [token], targets: [treasury] })

  const dailyFees = valutManagerFees.clone()
  const dailyRevenue = valutManagerFees.clone()
  const dailyHoldersRevenue = valutManagerFees.clone()
  dailyFees.addBalances(rebateManagerFees)
  dailyFees.addBalances(treasuryFees)
  dailyRevenue.addBalances(treasuryFees)

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.FANTOM]: {
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
    [CHAIN.ERA]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.LINEA]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.MANTLE]: {
      fetch,
      start: '2023-01-09',
    },
    [CHAIN.SONIC]: {
      fetch,
      start: '2024-12-18',
    }
  }
}

export default adapter;
