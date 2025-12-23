import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { addTokensReceived } from '../helpers/token'
import { getERC4626VaultsYield } from '../helpers/erc4626'

/**
 * TermMax Fee Adapter
 *
 * TermMax is a fixed-rate lending protocol where users borrow/lend at fixed rates
 * using Fixed-rate Tokens (FT) that mature to their face value.
 *
 * Fee Structure (docs: https://docs.ts.finance/termmax/transaction-fees):
 * - Lending Fee: 2% of APR * time to maturity
 * - Borrowing Fee: GT Minting Fee (10% of ref rate) + 3% of matched rate * time
 * - Leverage Fee: Same as borrowing fee, applied to leveraged amount
 * - Vault Performance Fee: 10-20% of vault profits
 *
 * Note: Fees are collected in FT tokens and settle to debt tokens at maturity.
 * Protocol revenue appears when positions mature, not when transactions occur.
 */

const TREASURY = '0x719e77027952929ed3060dbFFC5D43EC50c1cf79'

// TermMax Vaults per chain
// Docs: https://docs.ts.finance/technical-details/contract-addresses
const VAULTS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    '0x984408C88a9B042BF3e2ddf921Cd1fAFB4b735D1', // TMX-USDC
    '0xDEB8a9C0546A01b7e5CeE8e44Fd0C8D8B96a1f6e', // TMX-WETH
  ],
  [CHAIN.ARBITRUM]: [
    '0xc94b752839a22D2C44E99e298671dd4B2aDd11b3', // TMX-USDC
    '0x8c5161f287Cbc9Afa48bC8972eE8CC0a755fcAdC', // TMX-WETH
  ],
  [CHAIN.BSC]: [
    '0x86c958cac8aee37de62715691c0d597c710eca51', // TMX-USDT
    '0x89653e6523fb73284353252b41ae580e6f96dfad', // TMX-WBNB
  ],
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // Get protocol revenue from treasury
  const dailyProtocolRevenue = await addTokensReceived({
    options,
    target: TREASURY,
  })

  // Calculate yield earned by vault depositors (supply-side revenue)
  const vaults = VAULTS[options.chain] || []
  if (vaults.length > 0) {
    const vaultYields = await getERC4626VaultsYield({
      options,
      vaults,
    })
    dailySupplySideRevenue.addBalances(vaultYields)
  }

  // Total fees = yield to suppliers + protocol revenue
  dailyFees.addBalances(dailySupplySideRevenue)
  dailyFees.addBalances(dailyProtocolRevenue)

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Interest earned by lenders plus protocol fees from fixed-rate lending.',
  Revenue: 'Protocol fees settled to treasury when positions mature.',
  ProtocolRevenue: 'Lending, borrowing, leverage, and vault performance fees.',
  SupplySideRevenue: 'Yield earned by vault depositors from lending markets.',
}

const breakdownMethodology = {
  Fees: {
    'Vault Yields': 'Interest earned by vault depositors from borrower payments.',
    'Protocol Fees':
      'Fees from lending (2% of APR), borrowing/leverage (GT minting + 3% of rate), and vault performance (10-20%).',
  },
  Revenue: {
    'Settled Fees':
      'Fees collected in FT tokens that have matured and converted to actual tokens (e.g. USDC).',
  },
  ProtocolRevenue: {
    'Lending Fees': '2% of APR charged to lenders.',
    'Borrowing/Leverage Fees':
      'GT minting fee (10% of reference rate) plus 3% of matched borrowing rate.',
    'Vault Performance Fees': '10-20% of vault profits paid to curators.',
  },
  SupplySideRevenue: {
    'Vault Yields': 'Interest distributed to vault depositors who provide liquidity.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2025-03-27' },
    [CHAIN.ARBITRUM]: { fetch, start: '2025-03-27' },
    [CHAIN.BSC]: { fetch, start: '2025-05-28' },
  },
  methodology,
  breakdownMethodology,
}

export default adapter
