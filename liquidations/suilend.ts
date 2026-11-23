import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { getCheckpointAtTimestamp, graphqlCall } from '../helpers/sui'

const SUILEND = '0xf95b06141ed4a174f239417323bde3f209b972f5930d8521ea38a52aff3a6ddf'

const LiquidateEvent = `${SUILEND}::lending_market::LiquidateEvent`
const ReserveAssetDataEvent = `${SUILEND}::reserve::ReserveAssetDataEvent`

const LENDING_MARKETS = new Set([
  '0x84030d26d85eaa7035084a057f2f11f701b7e2e4eda87551becbc7c97505ece1', // LendingMarket<suilend::MAIN_POOL>
  '0x8a8d8e138a28de1c637d0b0955e621b017da7010de388db5a18493eca99c5e82', // LendingMarket<Matrixdock_gold::MATRIXDOCK_GOLD>
])

type EventPage = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
  nodes: { contents: { type: { repr: string }; json: any } }[]
}

const EVENT_PAGE = 'pageInfo { hasNextPage endCursor } nodes { contents { type { repr } json } }'

// liquidate() withdraws the ctokens through reserve::withdraw_ctokens, which logs the withdraw reserve's state in the same
// transaction, so the ratio is the one the liquidation settled at. It is supply_amount (a Decimal scaled by 1e18) / ctoken_supply.
async function getCtokenRatio(digest: string, page: EventPage, reserveId: string): Promise<[bigint, bigint]> {
  while (true) {
    const r = page.nodes.find(e => e.contents.type.repr === ReserveAssetDataEvent && e.contents.json.reserve_id === reserveId)
    if (r) return [BigInt(r.contents.json.supply_amount.value), BigInt(r.contents.json.ctoken_supply) * 10n ** 18n]
    if (!page.pageInfo.hasNextPage) throw new Error(`suilend: no ReserveAssetDataEvent for reserve ${reserveId} in tx ${digest}`)
    const data = await graphqlCall(`query ($digest: String!, $after: String) {
      transaction(digest: $digest) { effects { events(first: 50, after: $after) { ${EVENT_PAGE} } } }
    }`, { digest, after: page.pageInfo.endCursor })
    page = data.transaction.effects.events
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const { sequenceNumber } = await getCheckpointAtTimestamp(options.startTimestamp - 1)
  let after: string | null = null
  while (true) {
    const { events } = await graphqlCall(`query ($after: String) {
      events(first: 50, after: $after, filter: { type: "${LiquidateEvent}", afterCheckpoint: ${sequenceNumber} }) {
        pageInfo { hasNextPage endCursor }
        nodes { timestamp contents { json } transaction { digest effects { events(first: 50) { ${EVENT_PAGE} } } } }
      }
    }`, { after })

    for (const node of events.nodes) {
      if (Date.parse(node.timestamp) / 1e3 >= options.endTimestamp) return { dailyCollateralLiquidated }
      const e = node.contents.json
      if (!LENDING_MARKETS.has(e.lending_market_id)) continue
      const [supply, ctokenSupply] = await getCtokenRatio(node.transaction.digest, node.transaction.effects.events, e.withdraw_reserve_id)
      dailyCollateralLiquidated.add('0x' + e.withdraw_coin_type, (BigInt(e.withdraw_amount) * supply) / ctokenSupply)
    }

    if (!events.pageInfo.hasNextPage) return { dailyCollateralLiquidated }
    after = events.pageInfo.endCursor
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: '2024-03-08',
  methodology: {
    CollateralLiquidated: 'Collateral taken from obligations in Suilend\'s main and Matrixdock gold markets, converted from the reserve\'s ctokens to the underlying coin at the ctoken ratio of the liquidation. Includes the liquidator bonus and the protocol liquidation fee, both of which are paid out of the seized collateral.',
  },
}

export default adapter
