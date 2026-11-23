import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

// Successive settlement validators for the same Garuda marketplace, not separate products.
// Verified sources and immutable WISE/fee-recipient bindings:
// https://repo.sourcify.dev/1/0xf8a4719a149227a9a15456a62ac49baa8b95554d
// https://repo.sourcify.dev/1/0xb87Cf2cB81Fa97433213d2928c7b3A1424b05317
const LEGACY_ZONE = '0xf8a4719a149227a9a15456a62ac49baa8b95554d'
const MULTICURRENCY_ZONE = '0xb87cf2cb81fa97433213d2928c7b3a1424b05317'
const WISE = '0x66a0f676479cee1d7373f3dc2e2952778bff5bd6'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const legacyLogs = await options.getLogs({
    target: LEGACY_ZONE,
    eventAbi: 'event SaleValidated(bytes32 indexed orderHash, uint256 indexed tokenId, address indexed seller, address buyer, uint256 amount, uint256 fee, uint8 kind)',
  })
  const multicurrencyLogs = await options.getLogs({
    target: MULTICURRENCY_ZONE,
    eventAbi: 'event SaleValidated(bytes32 indexed orderHash, uint256 indexed tokenId, address indexed seller, address buyer, address currency, uint256 amount, uint256 fee, uint8 kind)',
  })

  // Both validators require Seaport to pay the exact fee to the immutable treasury
  // 0xB8d92F2E8D1A98c18cDe85e49a0F11e3c64D0a68, with no royalty/referrer split.
  // Read the actual raw fee; never count sale proceeds, stake principal, or router swaps.
  for (const log of legacyLogs) {
    dailyFees.add(WISE, log.fee, 'Marketplace Fees')
    dailyRevenue.add(WISE, log.fee, 'Marketplace Fees to Treasury')
  }
  for (const log of multicurrencyLogs) {
    dailyFees.add(log.currency.toLowerCase(), log.fee, 'Marketplace Fees')
    dailyRevenue.add(log.currency.toLowerCase(), log.fee, 'Marketplace Fees to Treasury')
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  start: '2026-11-06', // First SaleValidated event, Ethereum block 26355734.
  methodology: {
    Fees: 'Garuda charges a 0.5% marketplace fee on completed sales of transferable WISE staking-position NFTs, excluding sale proceeds, staking principal and payment-swap fees.',
    Revenue: 'Garuda retains the entire 0.5% marketplace fee on completed staking-position NFT sales, with no creator royalty or referral share.',
    ProtocolRevenue: 'The entire 0.5% marketplace fee on Garuda staking-position NFT sales is paid to the protocol treasury in the sale currency.',
  },
  breakdownMethodology: {
    Fees: {
      'Marketplace Fees': 'The exact fee recorded by Garuda settlement validators for completed staking-position NFT sales.',
    },
    Revenue: {
      'Marketplace Fees to Treasury': 'All recorded Garuda marketplace fees are retained by the protocol treasury.',
    },
    ProtocolRevenue: {
      'Marketplace Fees to Treasury': 'All recorded Garuda marketplace fees are paid to the protocol treasury.',
    },
  },
}

export default adapter
