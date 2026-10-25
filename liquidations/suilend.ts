import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { queryEvents } from '../helpers/sui'

// Emitted by lending_market::liquidate. withdraw_amount is the gross amount of the collateral reserve's ctokens taken from
// the obligation; protocol_fee_amount and liquidator_bonus_amount are carved out of it, so they are not added on top.
const LiquidateEvent = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::lending_market::LiquidateEvent'

type LiquidateEventData = {
  withdraw_reserve_id: string
  withdraw_coin_type: { name: string }
  withdraw_amount: string
}

const ReserveAssetDataEvent = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf::reserve::ReserveAssetDataEvent'

type ReserveAssetData = { reserve_id: string; supply_amount: { value: string }; ctoken_supply: string }

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()
  const events = await queryEvents<LiquidateEventData>({ eventType: LiquidateEvent, options })
  if (!events.length) return { dailyCollateralLiquidated }

  // liquidate() withdraws the ctokens through reserve::withdraw_ctokens, which logs the withdraw reserve's state in the same
  // transaction, so every liquidated reserve has a ReserveAssetDataEvent in the window. Its ctoken ratio is
  // supply_amount (a Decimal scaled by 1e18) / ctoken_supply; within one window it only moves by accrued interest.
  const ratios: Record<string, [bigint, bigint]> = {}
  const reserveData = await queryEvents<ReserveAssetData>({ eventType: ReserveAssetDataEvent, options })
  for (const r of reserveData) {
    if (BigInt(r.ctoken_supply) > 0n) ratios[r.reserve_id] = [BigInt(r.supply_amount.value), BigInt(r.ctoken_supply) * 10n ** 18n]
  }

  for (const e of events) {
    const ratio = ratios[e.withdraw_reserve_id]
    if (!ratio) throw new Error(`suilend: no ReserveAssetDataEvent for reserve ${e.withdraw_reserve_id} in the window`)
    dailyCollateralLiquidated.add('0x' + e.withdraw_coin_type.name, (BigInt(e.withdraw_amount) * ratio[0]) / ratio[1])
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: '2024-03-08',
  methodology: {
    CollateralLiquidated: 'Collateral taken from obligations in LiquidateEvent, converted from the reserve\'s ctokens to the underlying coin at the reserve\'s ctoken ratio. Includes the liquidator bonus and the protocol liquidation fee, both of which are paid out of the seized collateral.',
  },
}

export default adapter
