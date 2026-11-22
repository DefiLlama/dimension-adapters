import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

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
  const dailyVolume = options.createBalances()

  const { contract, token } = chainConfig[options.chain]

  const [purchaseLogs, buybackLogs] = await Promise.all([
    options.getLogs({ target: contract, eventAbi: PURCHASED_ABI, topics: [PURCHASE_TOPIC] }),
    options.getLogs({ target: contract, eventAbi: BUYBACK_ABI, topics: [BUYBACK_TOPIC] }),
  ])

  purchaseLogs.forEach((log: any) => dailyVolume.add(token, log.amount))
  buybackLogs.forEach((log: any) => dailyVolume.add(token, log.amount))

  return { dailyVolume }
}

const methodology = {
  Volume: 'Sum of pack purchase amounts plus USDC (USDC.e on Abstract) returned to players through the buyback program.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  fetch,
  adapter: chainConfig,
}

export default adapter
