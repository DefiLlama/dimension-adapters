import { CHAIN } from '../../helpers/chains'
import { compoundV2LiquidationsExport } from '../../helpers/compoundV2'
import { configs } from '../../fees/venus-finance'

// Venus core pool vTokens emit the Compound V2 LiquidateBorrow event, so the shared helper decodes
// them as-is. Comptrollers come from fees/venus-finance.ts; start dates are each chain's Venus launch
// (the fees file uses 2020-11-23 for chains that did not exist yet).
// Not covered: VAI liquidations (VAIController emits LiquidateVAI) and the isolated pools.
const startDates: Record<string, string> = {
  [CHAIN.BSC]: '2020-11-23',
  [CHAIN.ETHEREUM]: '2024-01-10',
  [CHAIN.OP_BNB]: '2024-02-16',
  [CHAIN.ARBITRUM]: '2024-05-30',
  [CHAIN.ERA]: '2024-09-06',
  [CHAIN.OPTIMISM]: '2024-10-01',
  [CHAIN.BASE]: '2024-12-07',
  [CHAIN.UNICHAIN]: '2025-02-08',
}

const config: Record<string, { comptroller: string; start?: string }> = {}
for (const [chain, start] of Object.entries(startDates)) {
  if (configs[chain]?.comptroller) config[chain] = { comptroller: configs[chain].comptroller, start }
}

export default compoundV2LiquidationsExport(config)
