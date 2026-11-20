// Defiance (https://defiance.so) on Robinhood Chain: every trade is a position against the Defiance House, whose LP
// vault takes the other side.
//
// Trades come from the House's event logs. A trade's product and leverage are part of its signed terms, which stay
// off-chain: the chain stores only their hash (termsHash). Defiance's public API returns each quote's product and
// notional by quote id, and every record is checked against the on-chain position (termsHash, stake, maxPayout)
// before it is used.
import { ChainApi } from "@defillama/sdk";
import { FetchOptions } from "../adapters/types";
import { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";

const HOUSE = '0x84fa704f41bdeedc2090fc0a21c4e5cca860c997' // DefianceHouse proxy, deployed 2026-10-24 at block 97066927
export const DEFIANCE_USDG = '0x5fc5360d0400a0fd4f2af552add042d716f1d168' // House.asset(): stakes and notionals are in USDG (6 decimals)
export const DEFIANCE_START = '2026-10-24'
const QUOTE_NOTIONALS = 'https://api.defiance.so/v1/analytics/quote-notionals' // at most 32 ids per request
const NOTIONAL_DEFINITION = 'entry-notional-v1'
const SETTLEMENT_REASONS = 'https://api.defiance.so/v1/analytics/settlement-reasons'
const HOUSE_START_BLOCK = 97066927
const GET_BETS_LIMIT = 64 // DefianceHouse.getBets reverts above 64 ids

// The only quotes with no stored terms: two $0.01 launch tests on 2026-10-24. Any other missing record stops the run.
const KNOWN_MISSING_QUOTES = new Set([
  '0xda0eced69a9dd471d51b8caadc9e032318a80f6096b06df4e3f4fc8d3ad22772',
  '0x18b7ba21cb4a28c88412d12999dd7ed153e0dc78aef2a024ff3398a37962f5e8',
])

export type DefianceKind = 'fixed-odds' | 'leveraged'

// Products are classified by family, so a new market in a known family needs no change here:
// - fixed-odds: solo (X post views) and mindshare (retired head-to-head pairs) pay a fixed amount if they win
// - leveraged (linear payoff): attention (crypto-Twitter attention index) and the rolling markets:
//   equity-* (e.g. equity-nvda), exchange-* (configured exchange-referenced markets, e.g. exchange-anthropic),
//   ai-* (AI usage and credit) and gpu-* (GPU rental)
// A product outside these families stops the run.
function kindOf(product: string | undefined, id: string): DefianceKind {
  if (product === 'solo' || product === 'mindshare') return 'fixed-odds'
  if (product === 'attention' || /^(equity|exchange|ai|gpu)-[a-z0-9-]+$/.test(product ?? '')) return 'leveraged'
  throw new Error(`defiance: unknown product ${product} for ${id}`)
}

const EVENTS = {
  // Ungrouped House, before the trade-group upgrade
  betAcceptedV1: 'event BetAccepted(bytes32 indexed id, address indexed user, bytes32 indexed marketId, uint256 stake, uint256 maxPayout, bytes32 termsHash)',
  betAccepted: 'event BetAccepted(bytes32 indexed id, address indexed user, bytes32 indexed marketId, uint8 groupId, uint256 stake, uint256 maxPayout, bytes32 termsHash)',
  // Emitted only for a close the trader signed (EIP-712 CloseConsent); liquidations and scheduled settlements never
  // emit it. Example: 0x15208054279785731cfb3b3aca178d232743d8e5be3647a905a4e896dab63eec (ai-credit, 2026-11-12).
  positionClosedEarly: 'event PositionClosedEarly(bytes32 indexed id, address indexed user, uint256 stakeClosed, uint256 payout, bytes32 evidenceHash, uint256 nonce, bool requireImmediate)',
  betSettled: 'event BetSettled(bytes32 indexed id, uint256 payout, bytes32 evidenceHash)',
}
const GET_BETS = 'function getBets(bytes32[] ids) view returns (tuple(tuple(bytes32 id, address user, bytes32 marketId, uint8 groupId, bytes32 termsHash, address resolver, uint256 stake, uint256 maxPayout, uint256 entryFee, uint256 maxSettlementFee, uint64 acceptBefore, uint64 resolveAfter, uint64 refundAfter, uint256 nonce) quote, uint8 status, uint256 payout, uint256 settlementFee, bytes32 evidenceHash, uint256 closedStake)[] result)'

type Quote = { id: string, status: string, termsHash?: string, stake?: string, maxPayout?: string, notional?: string, product?: string }

export type DefianceOpen = { id: string, product: string, kind: DefianceKind, stake: string, notional: string }
export type DefianceClose = { id: string, product: string, kind: DefianceKind, stakeClosed: string, notionalClosed: string }

async function getQuotes(ids: string[]): Promise<Record<string, Quote>> {
  const quotes: Record<string, Quote> = {}
  for (let i = 0; i < ids.length; i += 32) {
    const batch = ids.slice(i, i + 32)
    const response = await fetchURLAutoHandleRateLimit(`${QUOTE_NOTIONALS}?ids=${batch.join(',')}`)
    if (response?.definition !== NOTIONAL_DEFINITION || !Array.isArray(response.items) || response.items.length !== batch.length)
      throw new Error('defiance: unexpected quote-notionals response')
    for (const item of response.items) {
      const id = String(item.id).toLowerCase()
      if (!batch.includes(id) || quotes[id]) throw new Error('defiance: duplicate or unexpected quote id')
      quotes[id] = item
    }
  }
  return quotes
}

// The quote behind a trade, or null for the two known launch tests
function readyQuote(quotes: Record<string, Quote>, id: string): Quote | null {
  const quote = quotes[id]
  if (quote?.status === 'missing' && KNOWN_MISSING_QUOTES.has(id)) return null
  if (quote?.status !== 'ready') throw new Error(`defiance: terms for ${id} are ${quote?.status ?? 'absent'}`)
  return quote
}

function checkTerms(quote: Quote, id: string, onChain: { termsHash: any, stake: any, maxPayout: any }) {
  if (quote.termsHash!.toLowerCase() !== String(onChain.termsHash).toLowerCase()
    || BigInt(quote.stake!) !== BigInt(onChain.stake) || BigInt(quote.maxPayout!) !== BigInt(onChain.maxPayout))
    throw new Error(`defiance: terms for ${id} do not match the on-chain position`)
}

type PositionedLog = { id: string, args: any, blockNumber: number, blockHash: string, transactionHash: string, logIndex: number }

function positionedLogs(logs: any[]): PositionedLog[] {
  const seen = new Set<string>()
  return logs.map(log => {
    const item = {
      id: String(log.args?.id).toLowerCase(), args: log.args,
      blockNumber: Number(log.blockNumber), blockHash: String(log.blockHash).toLowerCase(),
      transactionHash: String(log.transactionHash).toLowerCase(), logIndex: Number(log.logIndex ?? log.index),
    }
    const key = `${item.transactionHash}:${item.logIndex}`
    if (String(log.address).toLowerCase() !== HOUSE || log.removed || seen.has(key)
      || ![item.id, item.blockHash, item.transactionHash, String(item.args?.evidenceHash)].every(v => /^0x[0-9a-f]{64}$/i.test(v))
      || !Number.isSafeInteger(item.blockNumber) || item.blockNumber < HOUSE_START_BLOCK
      || !Number.isSafeInteger(item.logIndex) || item.logIndex < 0)
      throw new Error('defiance: invalid or duplicate House log')
    seen.add(key)
    return item
  })
}

// Classification is metadata, not a volume total. Bind it to the exact finalized on-chain event; unknown or
// unindexed settlements must fail so a later refill can count them, rather than silently recording zero.
async function voluntarySettlements(logs: PositionedLog[]): Promise<PositionedLog[]> {
  const voluntary: PositionedLog[] = []
  for (let i = 0; i < logs.length; i += 32) {
    const batch = logs.slice(i, i + 32)
    const response = await fetchURLAutoHandleRateLimit(`${SETTLEMENT_REASONS}?ids=${batch.map(log => log.id).join(',')}`)
    if (response?.definition !== 'settlement-reason-v1' || response.chainId !== 4663
      || String(response.contract).toLowerCase() !== HOUSE || !Array.isArray(response.items) || response.items.length !== batch.length)
      throw new Error('defiance: unexpected settlement-reasons response')
    const seen = new Set<string>()
    for (const item of response.items) {
      const id = String(item.id).toLowerCase()
      const log = batch.find(log => log.id === id)
      if (!log || seen.has(id)) throw new Error('defiance: duplicate or unexpected settlement id')
      seen.add(id)
      if (item.status !== 'ready') throw new Error(`defiance: settlement for ${id} is ${item.status}`)
      if (item.eventName !== 'BetSettled' || item.blockNumber !== log.blockNumber || item.logIndex !== log.logIndex
        || String(item.blockHash).toLowerCase() !== log.blockHash || String(item.transactionHash).toLowerCase() !== log.transactionHash
        || String(item.evidenceHash).toLowerCase() !== String(log.args.evidenceHash).toLowerCase()
        || item.source !== 'resolverEvidence' || item.positionClosedEarlyLogIndex !== undefined)
        throw new Error(`defiance: settlement for ${id} does not match the on-chain event`)
      if (item.reason === 'traderClose') voluntary.push(log)
      else if (!['liquidation', 'expiry', 'void'].includes(item.reason)) throw new Error(`defiance: unknown settlement reason for ${id}`)
    }
  }
  return voluntary
}

// Opens and voluntary closes only. Signed closes prove intent on-chain; resolver closes additionally require
// immutable evidence bound to BetSettled. A full signed close emits both events and is counted just once.
export async function getDefianceTrades(options: FetchOptions): Promise<{ opens: DefianceOpen[], closes: DefianceClose[] }> {
  const entriesV1 = await options.getLogs({ target: HOUSE, eventAbi: EVENTS.betAcceptedV1 })
  const entriesV2 = await options.getLogs({ target: HOUSE, eventAbi: EVENTS.betAccepted })
  const fullLog = { target: HOUSE, entireLog: true, onlyArgs: false, parseLog: true, skipIndexer: true }
  const earlyCloses = positionedLogs(await options.getLogs({ ...fullLog, eventAbi: EVENTS.positionClosedEarly }))
  const settlements = positionedLogs(await options.getLogs({ ...fullLog, eventAbi: EVENTS.betSettled }))
  const entries = [...entriesV1, ...entriesV2]
  if (!entries.length && !earlyCloses.length && !settlements.length) return { opens: [], closes: [] }

  const idOf = (log: any) => String(log.id).toLowerCase()
  const quotes = await getQuotes([...new Set([...entries, ...earlyCloses, ...settlements].map(idOf))])

  const opens: DefianceOpen[] = []
  for (const log of entries) {
    const id = idOf(log)
    const quote = readyQuote(quotes, id)
    if (!quote) continue
    const kind = kindOf(quote.product, id)
    checkTerms(quote, id, log)
    opens.push({ id, product: quote.product!, kind, stake: String(log.stake), notional: quote.notional! })
  }

  // A close trades the closed share of the position's original notional. The position may have been opened in an
  // earlier window, so its terms are read from the House. They are fixed when the position opens and never change,
  // so the latest block gives the same answer for any past window; the public Robinhood Chain RPCs don't serve
  // historical state ("historical state ... is not available"), so a point-in-time read would fail.
  if (new Set(settlements.map(idOf)).size !== settlements.length) throw new Error('defiance: multiple terminal settlements for one position')
  const resolverLogs = settlements.filter(log => {
    const quote = readyQuote(quotes, log.id)
    if (!quote || kindOf(quote.product, log.id) !== 'leveraged') return false
    return !earlyCloses.some(close => close.id === log.id && close.transactionHash === log.transactionHash
      && close.blockHash === log.blockHash && close.logIndex < log.logIndex
      && String(close.args.evidenceHash).toLowerCase() === String(log.args.evidenceHash).toLowerCase())
  })
  const resolverCloses = await voluntarySettlements(resolverLogs)
  const closeIds = [...new Set([...earlyCloses, ...resolverCloses].map(idOf))]
  const bets: Record<string, any> = {}
  const latest = new ChainApi({ chain: options.chain })
  for (let i = 0; i < closeIds.length; i += GET_BETS_LIMIT) {
    const batch = closeIds.slice(i, i + GET_BETS_LIMIT)
    const result = await latest.call({ target: HOUSE, abi: GET_BETS, params: [batch] })
    if (!Array.isArray(result) || result.length !== batch.length) throw new Error('defiance: unexpected getBets response')
    batch.forEach((id, j) => { bets[id] = result[j] })
  }
  const closes: DefianceClose[] = []
  function addClose(id: string, stakeClosed: bigint) {
    const quote = readyQuote(quotes, id)
    if (!quote) return
    const kind = kindOf(quote.product, id)
    checkTerms(quote, id, bets[id].quote)
    const stake = BigInt(quote.stake!)
    if (stakeClosed <= 0n || stakeClosed > stake) throw new Error(`defiance: ${id} closed ${stakeClosed} of a ${stake} stake`)
    closes.push({ id, product: quote.product!, kind, stakeClosed: stakeClosed.toString(), notionalClosed: (BigInt(quote.notional!) * stakeClosed / stake).toString() })
  }
  for (const log of earlyCloses) addClose(log.id, BigInt(log.args.stakeClosed))

  // Latest getBets.closedStake includes the terminal settlement, so it cannot tell us the remaining stake at that
  // exit. Read prior partial-close logs, filtering indexed quote ids in bounded batches (never all House history).
  for (let i = 0; i < resolverCloses.length; i += 32) {
    const batch = resolverCloses.slice(i, i + 32)
    const filter = { extraTopics: [batch.map(log => log.id)] }
    const history = positionedLogs(await options.getLogs({ ...fullLog, ...filter, eventAbi: EVENTS.positionClosedEarly,
      fromBlock: HOUSE_START_BLOCK, toBlock: Math.max(...batch.map(log => log.blockNumber)) }))
    const prior: Record<string, bigint> = {}
    for (const close of history) {
      const terminal = batch.find(log => log.id === close.id)
      if (!terminal || close.blockNumber > terminal.blockNumber
        || (close.blockNumber === terminal.blockNumber && close.logIndex >= terminal.logIndex)
        || BigInt(close.args.stakeClosed) <= 0n) throw new Error('defiance: invalid partial-close history')
      prior[close.id] = (prior[close.id] ?? 0n) + BigInt(close.args.stakeClosed)
    }
    for (const log of batch) addClose(log.id, BigInt(quotes[log.id].stake!) - (prior[log.id] ?? 0n))
  }
  return { opens, closes }
}
