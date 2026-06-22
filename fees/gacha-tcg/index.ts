import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

// Gacha Pull main contract on Abstract (pack purchases & buyback events)
// https://abscan.org/address/0x268031de8363401d61b6a256bea009bb57277619
const CONTRACT = '0x268031de8363401d61b6a256bea009bb57277619'
const USDC_E = '0x84a71ccd554cc1b02749b35d22f684cc8ec987e1'

const PURCHASE_TOPIC = '0x7f13db84050d22dfb1e745ac7a5505f8d3cbbc4513e28555749286e28fc90d60'
const BUYBACK_TOPIC = '0xc6d5275a2e779159157ae9621600816f3af8d899854cc629c70530785f781bb1'

const BUYBACK_ABI = 'event Buyback(address player, uint256[] cardIds, address token, uint256 amount)'
const PURCHASED_ABI = 'event Purchased(uint256 indexed seqNo, uint32 indexed presetId, address indexed player, address token, uint256 amount)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [purchaseLogs, buybackLogs] = await Promise.all([
    options.getLogs({ target: CONTRACT, eventAbi: PURCHASED_ABI, topics: [PURCHASE_TOPIC] }),
    options.getLogs({ target: CONTRACT, eventAbi: BUYBACK_ABI, topics: [BUYBACK_TOPIC] }),
  ])

  purchaseLogs.forEach((log: any) => {
    dailyFees.add(USDC_E, log.amount, 'Pack purchases')
    dailyRevenue.add(USDC_E, log.amount, 'Pack purchases')
  })
  buybackLogs.forEach((log: any) => {
    dailySupplySideRevenue.add(USDC_E, log.amount, 'Buybacks')
    dailyRevenue.add(USDC_E, -log.amount, 'Buybacks')
  })

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyUserFees: dailyRevenue,
  }
}

const methodology = {
  Fees: 'Gross USDC.e paid by players to mint card packs (Purchased event).',
  Revenue: 'Net spread captured by the protocol: pack purchases minus USDC.e returned to players through the buyback program.',
  SupplySideRevenue: 'USDC.e returned to players when they sell cards back to the protocol (Buyback event).',
  UserFees: 'Net amount paid by players: pack purchases minus USDC.e received back through the buyback program (i.e. the actual economic cost to players).',
}

const breakdownMethodology = {
  Fees: {
    'Pack purchases': 'USDC.e paid by players to mint card packs (Purchased event).',
  },
  Revenue: {
    'Pack purchases': 'USDC.e paid by players to mint card packs (Purchased event).',
    'Buybacks': 'USDC.e returned to players when they sell cards back to the protocol (Buyback event); subtracted from revenue.',
  },
  SupplySideRevenue: {
    'Buybacks': 'USDC.e returned to players when they sell cards back to the protocol (Buyback event).',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // hourly buybacks can exceed hourly pack purchases
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2025-09-18',
    },
  },
}

export default adapter
