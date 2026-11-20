import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

// Trades are on-chain, but product and notional are part of off-chain signed terms; the API serves them by position id
const HOUSE = '0x84fa704f41bdeedc2090fc0a21c4e5cca860c997'
const API = 'https://api.defiance.so/v1/analytics'
const FIXED_ODDS_PRODUCTS = ['solo', 'mindshare']

const EVENTS = {
  betAcceptedV1: 'event BetAccepted(bytes32 indexed id, address indexed user, bytes32 indexed marketId, uint256 stake, uint256 maxPayout, bytes32 termsHash)',
  betAccepted: 'event BetAccepted(bytes32 indexed id, address indexed user, bytes32 indexed marketId, uint8 groupId, uint256 stake, uint256 maxPayout, bytes32 termsHash)',
  positionClosedEarly: 'event PositionClosedEarly(bytes32 indexed id, address indexed user, uint256 stakeClosed, uint256 payout, bytes32 evidenceHash, uint256 nonce, bool requireImmediate)',
  betSettled: 'event BetSettled(bytes32 indexed id, uint256 payout, bytes32 evidenceHash)',
}

async function getItems(endpoint: string, ids: string[]): Promise<any[]> {
  const items: any[] = []
  for (let i = 0; i < ids.length; i += 32)
    items.push(...(await fetchURL(`${API}/${endpoint}?ids=${ids.slice(i, i + 32).join(',')}`)).items)
  return items
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const opens = [
    ...await options.getLogs({ target: HOUSE, eventAbi: EVENTS.betAcceptedV1 }),
    ...await options.getLogs({ target: HOUSE, eventAbi: EVENTS.betAccepted }),
  ]
  const earlyCloses = await options.getLogs({ target: HOUSE, eventAbi: EVENTS.positionClosedEarly })
  const settlements = await options.getLogs({ target: HOUSE, eventAbi: EVENTS.betSettled })

  const quotes: Record<string, any> = {}
  for (const quote of await getItems('quote-notionals', [...new Set([...opens, ...earlyCloses, ...settlements].map(log => log.id))])) {
    if (quote.status !== 'ready') throw new Error(`defiance: terms for ${quote.id} are ${quote.status}`)
    quotes[quote.id] = quote
  }
  const isLeveraged = (id: string) => !FIXED_ODDS_PRODUCTS.includes(quotes[id].product)
  const addNotional = (id: string, stakeClosed = quotes[id].stake) => {
    if (isLeveraged(id)) dailyVolume.add(ADDRESSES.robinhood.USDG, BigInt(quotes[id].notional) * BigInt(stakeClosed) / BigInt(quotes[id].stake))
  }

  opens.forEach(log => addNotional(log.id))
  earlyCloses.forEach(log => addNotional(log.id, log.stakeClosed))

  // Signed closes (source 'onchain') already emitted PositionClosedEarly
  for (const settlement of await getItems('settlement-reasons', settlements.map(log => log.id).filter(isLeveraged))) {
    if (settlement.status !== 'ready') throw new Error(`defiance: settlement reason for ${settlement.id} is ${settlement.status}`)
    if (settlement.reason === 'traderClose' && settlement.source === 'resolverEvidence') addNotional(settlement.id)
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-10-25',
  methodology: {
    Volume: 'Notional value (collateral times leverage) of leveraged positions opened on Defiance, plus the notional of positions traders close early, by a signed on-chain close or through the resolver. Liquidations, scheduled settlements, voids, refunds and fixed-odds products (solo, mindshare) are excluded.',
  },
}

export default adapter
