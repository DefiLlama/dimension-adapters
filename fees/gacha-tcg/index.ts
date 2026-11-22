import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { PHYSICAL_CARD_COSTS } from "../../helpers/physicalCards"

// Gacha Pull main contract (pack purchases & buyback events), per chain.
// Abstract: https://abscan.org/address/0x268031de8363401d61b6a256bea009bb57277619, paid in USDC.e;
// sales paused 2026-11-17 (last Purchased 01:54 UTC, block 89275629).
// Base: https://basescan.org/address/0xbc73621a1a8a3582f4e5eaeb6dc595607da88155 (gachaMall in the pull.gacha.game
// Base config), paid in USDC; first Purchased 2026-11-17 07:36 UTC, tx 0xa12c19c87ca24c8ebe4dfe935b129e4bd410e670288dac7092455b24d9b5e77e
const chainConfig: Record<string, { contract: string, token: string, start: string }> = {
  [CHAIN.ABSTRACT]: { contract: '0x268031de8363401d61b6a256bea009bb57277619', token: ADDRESSES.abstract.USDC, start: '2025-09-18' },
  [CHAIN.BASE]: { contract: '0xbc73621a1a8a3582f4e5eaeb6dc595607da88155', token: ADDRESSES.base.USDC, start: '2026-11-17' },
}

const PURCHASE_TOPIC = '0x7f13db84050d22dfb1e745ac7a5505f8d3cbbc4513e28555749286e28fc90d60'
const BUYBACK_TOPIC = '0xc6d5275a2e779159157ae9621600816f3af8d899854cc629c70530785f781bb1'

const BUYBACK_ABI = 'event Buyback(address player, uint256[] cardIds, address token, uint256 amount)'
const PURCHASED_ABI = 'event Purchased(uint256 indexed seqNo, uint32 indexed presetId, address indexed player, address token, uint256 amount)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const { contract, token } = chainConfig[options.chain]

  const [purchaseLogs, buybackLogs] = await Promise.all([
    options.getLogs({ target: contract, eventAbi: PURCHASED_ABI, topics: [PURCHASE_TOPIC] }),
    options.getLogs({ target: contract, eventAbi: BUYBACK_ABI, topics: [BUYBACK_TOPIC] }),
  ])

  purchaseLogs.forEach((log: any) => {
    dailyFees.add(token, log.amount, 'Pack purchases')
    dailyRevenue.add(token, log.amount, 'Pack purchases')
  })
  // fees are pack sales net of buybacks (fees/AGENTS.md, as in fees/collector-crypt)
  buybackLogs.forEach((log: any) => {
    dailyFees.subtractToken(token, log.amount, 'Pack purchases')
    dailyRevenue.subtractToken(token, log.amount, 'Pack purchases')
  })

  return {
    dailyFees,
    dailyRevenue,
    dailyUserFees: dailyRevenue,
  }
}

const methodology = {
  Fees: 'USDC (USDC.e on Abstract) paid by players to mint card packs (Purchased event), net of USDC returned to players when they sell cards back to the protocol (Buyback event).',
  Revenue: 'Pack purchases net of buybacks; all of it goes to the protocol.',
  UserFees: 'Net amount paid by players: pack purchases minus USDC (USDC.e on Abstract) received back through the buyback program.',
}

const breakdownMethodology = {
  Fees: {
    'Pack purchases': 'USDC (USDC.e on Abstract) paid by players to mint card packs (Purchased event), minus USDC returned through buybacks (Buyback event).',
  },
  Revenue: {
    'Pack purchases': 'USDC (USDC.e on Abstract) paid by players to mint card packs (Purchased event), minus USDC returned through buybacks (Buyback event).',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // net fees go negative in hours when buybacks exceed pack purchases
  methodology,
  breakdownMethodology,
  unknownBreakdownMethodology: PHYSICAL_CARD_COSTS,
  fetch,
  adapter: chainConfig,
}

export default adapter
