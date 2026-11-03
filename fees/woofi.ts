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
  [CHAIN.BASE]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d',
  // Discontinued chains commented out in place with reason:
  // [CHAIN.FANTOM]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d', // Discontinued support
  // [CHAIN.ERA]: '0xC889e471d533BEA7fb4c58229F8a60E36a1e5068', // Discontinued support
  // [CHAIN.LINEA]: '0x99A619736c0500d43C6207E05C66C3E43B330a66', // Discontinued support
  // [CHAIN.MANTLE]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d', // Discontinued support
  // [CHAIN.SONIC]: '0xc45b55032cafeaff3b8057d52758d8f8211da54d', // Discontinued support
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
    },
    // Discontinued chains commented out in place with reason:
    // [CHAIN.FANTOM]: { fetch, start: '2023-01-09' }, // Discontinued support
    // [CHAIN.ERA]: { fetch, start: '2023-05-18' }, // Discontinued support
    // [CHAIN.LINEA]: { fetch, start: '2023-08-23' }, // Discontinued support
    // [CHAIN.MANTLE]: { fetch, start: '2023-10-06' }, // Discontinued support
    // [CHAIN.SONIC]: { fetch, start: '2024-12-25' }, // Discontinued support
  }
}

export default adapter;
