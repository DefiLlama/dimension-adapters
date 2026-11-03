import * as sdk from '@defillama/sdk'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { graphqlCall, queryEvents } from '../helpers/sui'
import fetchURL from '../utils/fetchURL'

const NAVI_API = 'https://open-api.naviprotocol.io/api/navi'

// lending::base_liquidation_call emits LiquidationEvent with collateral_amount = collateral sent to the liquidator (debt plus
// bonus) + the treasury's cut, in the collateral coin's own decimals, and collateral_price, the NAVI oracle price used for the
// liquidation, scaled by the same decimals. The struct moved to a new `event` module on 2026-02-11, which also added market_id;
// the older type only ever fired for the main market (id 0).
const LiquidationEvents = [
  { type: '0xc6374c7da60746002bfee93014aeb607e023b2d6b25c9e55a152b826dbc8c1ce::lending::LiquidationEvent', until: 1770768000 }, // 2026-02-11
  { type: '0x1e4a13a0494d5facdbe8473e74127b838c2d446ecec0ce262e2eddafa77259cb::event::LiquidationEvent', from: 1770768000 },
]

type LiquidationEventData = { collateral_asset: number; collateral_amount: string; collateral_price: string; market_id?: string }

// market id -> asset id -> coin type, read from each market's Storage reserves table
async function getReserveCoinTypes(marketIds: number[]): Promise<Record<number, Record<number, string>>> {
  const { data: { markets } } = await fetchURL(`${NAVI_API}/markets?env=prod`)
  const result: Record<number, Record<number, string>> = {}
  for (const marketId of marketIds) {
    const market = markets.find((m: any) => m.id === marketId)
    if (!market) throw new Error(`navi: market ${marketId} not found`)
    const { data: { storage } } = await fetchURL(`${NAVI_API}/config?env=prod&market=${market.key}`)
    const storageObject: any = await sdk.chains.sui.getObject({ objectId: storage })
    const reserves: any[] = await sdk.chains.sui.getDynamicFieldObjects({ parent: storageObject.fields.reserves.fields.id.id } as any)
    result[marketId] = {}
    for (const r of reserves) result[marketId][Number(r.fields.value.fields.id)] = '0x' + r.fields.value.fields.coin_type
  }
  return result
}

async function getDecimals(coinType: string): Promise<number> {
  const { coinMetadata } = await graphqlCall(`query ($coinType: String!) { coinMetadata(coinType: $coinType) { decimals } }`, { coinType })
  if (coinMetadata?.decimals == null) throw new Error(`navi: no coin metadata for ${coinType}`)
  return Number(coinMetadata.decimals)
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const events: LiquidationEventData[] = []
  for (const { type, from = 0, until = Infinity } of LiquidationEvents) {
    if (options.endTimestamp <= from || options.startTimestamp >= until) continue
    events.push(...await queryEvents<LiquidationEventData>({ eventType: type, options }))
  }
  if (!events.length) return { dailyCollateralLiquidated }

  const marketIds = [...new Set(events.map((e) => Number(e.market_id ?? 0)))]
  const coinTypes = await getReserveCoinTypes(marketIds)

  const decimals: Record<string, number> = {}
  for (const e of events) {
    const marketId = Number(e.market_id ?? 0)
    const coinType = coinTypes[marketId][Number(e.collateral_asset)]
    if (!coinType) throw new Error(`navi: asset ${e.collateral_asset} not found in market ${marketId}`)
    if (decimals[coinType] === undefined) decimals[coinType] = await getDecimals(coinType)
    // value at the oracle price the liquidation used; liquidations cluster in fast moves that an hourly price misses
    const scale = 10 ** decimals[coinType]
    dailyCollateralLiquidated.addUSDValue((Number(e.collateral_amount) / scale) * (Number(e.collateral_price) / scale))
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: '2024-04-15',
  methodology: {
    CollateralLiquidated: 'Collateral taken from borrowers in LiquidationEvent, across every NAVI market, valued at the oracle price recorded in the event. Includes the liquidator bonus and the treasury\'s share of it, both of which come out of the seized collateral.',
  },
}

export default adapter
