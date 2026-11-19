import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const { call, getCheckpointAtTimestamp, normalizeCoinType, parseStructTag } = sdk.chains.sui

// Virtue mainnet packages, from the app config bundled at https://info.virtue.money
// Every fee is collected into the VUSD Treasury (0x81f525f4fa5b2d3cf58677d3e39aabc4b0a1ca25cbba605033cfe417e47b0a16)
// through vusd::collect, which emits vusd::Collect<FeeCoin, ModuleWitness> { memo, amount }.
// (replaces https://info.virtue.money/api/v1/fees, a 24h-only endpoint that has returned HTTP 500 since 2026-10-23)
const VUSD_PACKAGE = '0xd3b63e603a78786facf65ff22e79701f3e824881a12fa3268d62a75530fe904f'
const VUSD = normalizeCoinType(`${VUSD_PACKAGE}::vusd::VUSD`)
const COLLECT_EVENT = `${VUSD_PACKAGE}::vusd::Collect<`
// oracle package: aggregater::PriceAggregated<Coin> { result } is the USD price of one whole token scaled by 1e9
const PRICE_EVENT = '0x7eebbee92f64ba2912bdbfba1864a362c463879fc5b3eacc735c1dcb255cc2cf::aggregater::PriceAggregated<'
// post-exploit recovery module, listed in the Treasury's module_supply_map
const RECOVERY_MINT_EVENT = `${VUSD_PACKAGE}::vusd::Mint<0x732ce63849c64d630f256f2a926c90b309ffbc6a9a6806239088e1649ff8c952::recovery::VirtueRecovery>`

// memo strings are constants in the cdp (0xb0ca01917f84a07774397395467fc2d56de377fab9d603cb79b82f062d1f6e9a),
// stability pool (0xe50fa492446245d9dd4bc61641a4ab2e72cd1276703d6ae8e41377a046b0929b) and psm (0x3553aff52bad6b066d76bfe0d7a397772a83eb9bea8a8c9ae6b72d75c52defe3) bytecode
const MEMO_LABELS: Record<string, string> = {
  interest: METRIC.BORROW_INTEREST, // CDP interest, charged in VUSD whenever a position is updated
  liquidation_fee: METRIC.LIQUIDATION_FEES, // stability pool cut of the collateral paid out on liquidations
  flashloan: METRIC.FLASHLOAN_FEES,
  psm_swap_in: METRIC.MINT_REDEEM_FEES,
  psm_swap_out: METRIC.MINT_REDEEM_FEES,
}

// PSM assets with no oracle price in the swap tx
const PSM_STABLES_CG: Record<string, string> = {
  [normalizeCoinType('0x25afeacdd3b0e757ae40aa4b9852261003e1dffeeb37d2c4f2904bb809807ac9::usdt0::USDT0')]: 'usdt0',
}

// 2026-08-28 oracle exploit: the IOTA vault price was set to $10M to borrow 4.94M VUSD against 1 IOTA
// (tx CaAD9SRJjuvEbNiHQcgT176kg4F8jKUTM1EneeYsd3Gd), then to $0.0135 to liquidate healthy positions
// (e.g. tx 9TmBk7oth9hZua2aQpN3QF7wdp9iqxyLRj2a29gMpG6W). Fees between the attacker's first (21:51:13 UTC)
// and last (22:58:50 UTC) tx are excluded.
const EXPLOIT_START_MS = Date.parse('2026-08-28T21:51:00Z')
const EXPLOIT_END_MS = Date.parse('2026-08-28T23:00:00Z')

const iotaCall = (method: string, params: any[]) => call({ chain: 'iota', method, params })

const decimalsCache: Record<string, Promise<number>> = {}
const getDecimals = (coinType: string) => decimalsCache[coinType] ??= iotaCall('iotax_getCoinMetadata', [coinType]).then((meta: any) => {
  if (meta?.decimals === undefined) throw new Error(`virtue: no coin metadata for ${coinType}`)
  return Number(meta.decimals)
}).catch((e) => {
  delete decimalsCache[coinType] // do not cache a failed lookup for the next window
  throw e
})

const VUSD_EVENTS_FILTER = { MoveEventModule: { package: VUSD_PACKAGE, module: 'vusd' } }

// vusd module events in [startTimestamp, endTimestamp). The RPC cannot combine a module and a time filter,
// so paging starts from a transaction of the last checkpoint before the window.
async function getVusdEvents(options: FetchOptions) {
  const startMs = options.startTimestamp * 1e3
  const endMs = options.endTimestamp * 1e3
  const { sequenceNumber } = await getCheckpointAtTimestamp({ chain: 'iota', timestamp: options.startTimestamp - 1 })
  const checkpoint = await iotaCall('iota_getCheckpoint', [String(sequenceNumber)])
  // the node drops the first match after a cursor that is not itself a matching event, so step back to a
  // matching event before the window and page forward from it (null = from the first event ever)
  const before = await iotaCall('iotax_queryEvents', [VUSD_EVENTS_FILTER, { txDigest: checkpoint.transactions[0], eventSeq: '0' }, 1, true])
  let cursor = before.data[0]?.id ?? null
  const events: any[] = []
  while (true) {
    const page = await iotaCall('iotax_queryEvents', [VUSD_EVENTS_FILTER, cursor, 50, false])
    for (const event of page.data) {
      const ts = Number(event.timestampMs)
      if (ts >= endMs) return events
      if (ts >= startMs) events.push(event)
    }
    if (!page.hasNextPage) return events
    cursor = page.nextCursor
  }
}

// oracle prices emitted in each tx: digest -> coin type -> USD per whole token
async function getTxPrices(digests: string[]) {
  const prices: Record<string, Record<string, number>> = {}
  for (let i = 0; i < digests.length; i += 50) {
    const txs = await iotaCall('iota_multiGetTransactionBlocks', [digests.slice(i, i + 50), { showEvents: true }])
    for (const tx of txs) {
      prices[tx.digest] = {}
      for (const event of tx.events ?? []) {
        if (!event.type.startsWith(PRICE_EVENT)) continue
        const [coinType] = parseStructTag(event.type).typeParams
        prices[tx.digest][normalizeCoinType(coinType)] = Number(event.parsedJson.result) / 1e9
      }
    }
  }
  return prices
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const events = await getVusdEvents(options)

  const recoveryTxs = new Set(events.filter(e => e.type === RECOVERY_MINT_EVENT).map(e => e.id.txDigest))
  const collects = events.filter(e => {
    if (!e.type.startsWith(COLLECT_EVENT)) return false
    const ts = Number(e.timestampMs)
    if (ts >= EXPLOIT_START_MS && ts < EXPLOIT_END_MS) return false
    // recovery txs repay the exploiter's debt with recovery-minted VUSD; the interest booked on it is claimed and burned in the same tx
    return !recoveryTxs.has(e.id.txDigest)
  })

  const coinTypeOf = (e: any) => normalizeCoinType(parseStructTag(e.type).typeParams[0])
  const pricedTxs = [...new Set(collects.filter(e => coinTypeOf(e) !== VUSD && !PSM_STABLES_CG[coinTypeOf(e)]).map(e => e.id.txDigest))]
  const txPrices = await getTxPrices(pricedTxs)

  for (const e of collects) {
    const { memo, amount } = e.parsedJson
    const label = MEMO_LABELS[memo]
    if (!label) throw new Error(`virtue: unknown fee memo "${memo}" in tx ${e.id.txDigest}`)
    const coinType = coinTypeOf(e)
    const tokens = Number(amount) / 10 ** await getDecimals(coinType)

    if (coinType === VUSD) {
      // VUSD fees are counted at $1, the value the CDP books VUSD debt at
      dailyFees.addUSDValue(tokens, label)
    } else if (PSM_STABLES_CG[coinType]) {
      dailyFees.addCGToken(PSM_STABLES_CG[coinType], tokens, label)
    } else {
      // collateral is valued with the protocol's oracle price used in the same liquidation tx
      const price = txPrices[e.id.txDigest]?.[coinType]
      if (price === undefined) throw new Error(`virtue: no oracle price for ${coinType} in tx ${e.id.txDigest}`)
      dailyFees.addUSDValue(tokens * price, label)
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Fees: "Interest paid by VUSD borrowers, the protocol's cut of collateral paid out in stability pool liquidations, flash loan fees and PSM swap fees, as collected into the VUSD treasury on-chain.",
  UserFees: "Interest paid by VUSD borrowers, the protocol's cut of collateral paid out in stability pool liquidations, flash loan fees and PSM swap fees.",
  Revenue: "All interest, liquidation, flash loan and PSM fees go to the Virtue treasury.",
  ProtocolRevenue: "All interest, liquidation, flash loan and PSM fees go to the Virtue treasury.",
}

const breakdown = {
  [METRIC.BORROW_INTEREST]: 'Interest paid in VUSD by borrowers, collected whenever a position is updated.',
  [METRIC.LIQUIDATION_FEES]: "Protocol's cut of the collateral paid out to stability pool depositors on liquidations, valued at the protocol's oracle price.",
  [METRIC.FLASHLOAN_FEES]: 'Fees paid on VUSD flash loans.',
  [METRIC.MINT_REDEEM_FEES]: 'Fees paid on PSM swaps between VUSD and stablecoins.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.IOTA],
  start: '2025-06-24',
  methodology,
  breakdownMethodology: {
    Fees: breakdown,
    UserFees: breakdown,
    Revenue: breakdown,
    ProtocolRevenue: breakdown,
  },
};

export default adapter;
