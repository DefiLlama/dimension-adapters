import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { queryAllium } from '../../helpers/allium'
import { PHYSICAL_CARD_COSTS } from '../../helpers/physicalCards'

/** Gross pack spend, shown separately from USDC paid back to players. */
const LABEL_PACK_PURCHASES = 'Pack Purchases'
/** USDC returned to players, subtracted from fees so the row nets against purchases. */
const LABEL_BUYBACKS = 'Buybacks'

/** FluxBox proxy on Base, emits BuyAndRaffle once per spin with its full price. https://basescan.org/address/0x93c4bD8598d7f3710b7C558A725E324746CCDb5c */
const BASE_FLUX_BOX = '0x93c4bD8598d7f3710b7C558A725E324746CCDb5c'

/** FluxPool on Base, holds the prize USDC and pays every prize, sell-back, fee and owner withdrawal. https://basescan.org/address/0x8f2FA5ad58a5f846eC71a7662f8d8864733ed5fd */
const BASE_FLUX_POOL = '0x8f2FA5ad58a5f846eC71a7662f8d8864733ed5fd'

const BUY_AND_RAFFLE =
  'event BuyAndRaffle(address sender, uint256 reqId, uint256 rollId, uint256 stakeAmount)'
const SELL_FEE_COLLECTED =
  'event SellFeeCollected(address indexed user, uint256 id, bytes32 signature, address indexed feeRecipient, uint256 amount)'
const WITHDRAWAL = 'event Withdrawal(address indexed to, uint256 amount)'
const TRANSFER = 'event Transfer(address indexed from, address indexed to, uint256 value)'

/** keccak256("Transfer(address,address,uint256)") */
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

/** Super Gacha Anchor program. https://solscan.io/account/RFLX1rk1Bv4WxWkQPVTaYY6PYZFkmwE7k3ZZTUfHF6f */
const SOLANA_SUPERGACHA_PROGRAM = 'RFLX1rk1Bv4WxWkQPVTaYY6PYZFkmwE7k3ZZTUfHF6f'

/** GachaPool PDA (game 0, pool 0); owns the prize USDC vault 4xi9R87r3UQMhxTKVX21sPSEGeLoqTM44r79hh7fsvM4. */
const SOLANA_POOL = 'FhbAGTpqG9JaWvVWQgks7dLsZGycGqjDb7vDL2jBpPVX'

/** Owner of GachaGame.revenue_destination; receives the 10% fee kept on cash-outs and sell-backs. */
const SOLANA_REVENUE_OWNER = '4ypyGqvxFMcvYVnWTHnhjQmcbPpXP86RNFyQnv1if63r'

/** Anchor discriminators sha256("global:<instruction>")[0..8] from the raflux_supergacha IDL. */
const SPEND_IX = ['c291a268e0402f05', '162c1305c6ac8a9a']
const REFUND_IX = ['964514d0309934bf', 'cd20bedd39f0962e']
const PAYOUT_IX = [
  '40f37576542605db',
  '1f11ddd3022ebb96',
  '9de98b79f63eeaeb',
  '57eb00ff3014087c',
  '408339599e85f91e',
]

const addressTopic = (address: string) =>
  '0x000000000000000000000000' + address.slice(2).toLowerCase()

const sumField = (logs: any[], field: string) =>
  logs.reduce((total, log) => total + BigInt(log[field].toString()), 0n)

const sqlList = (values: string[]) => values.map((v) => `'${v}'`).join(', ')

/**
 * Base: spend = full spin price from BuyAndRaffle. payout = every USDC transfer out of FluxPool
 * (claims, sell-backs, and payoutFluxBoxPrize which emits no event of its own) minus the
 * sell-back fee kept by Raflux and owner withdrawals.
 */
const fetchBase = async (options: FetchOptions) => {
  const spins = await options.getLogs({ target: BASE_FLUX_BOX, eventAbi: BUY_AND_RAFFLE })
  const poolTransfersOut = await options.getLogs({
    target: ADDRESSES.base.USDC,
    eventAbi: TRANSFER,
    topics: [TRANSFER_TOPIC, addressTopic(BASE_FLUX_POOL)],
  })
  const sellFees = await options.getLogs({ target: BASE_FLUX_POOL, eventAbi: SELL_FEE_COLLECTED })
  const withdrawals = await options.getLogs({ target: BASE_FLUX_POOL, eventAbi: WITHDRAWAL })
  const spend = sumField(spins, 'stakeAmount')
  const payout =
    sumField(poolTransfersOut, 'value') -
    sumField(sellFees, 'amount') -
    sumField(withdrawals, 'amount')
  return { spend, payout }
}

/**
 * Solana: each USDC transfer to or from the pool PDA is attributed to the top-level Super Gacha
 * instruction that made it. Spend is everything paid into the pool by start_spin*. A cancelled
 * spin keeps its spend in the hour it was paid and its refund counts as USDC returned, like
 * cash-outs, claims, sell-backs and shipment reimbursements (except the fee leg to the revenue
 * owner), so volume never goes negative. Owner withdrawals and plain top-ups match no listed
 * instruction.
 */
const fetchSolana = async (options: FetchOptions) => {
  const timeRange = (alias: string) =>
    `${alias}.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND ${alias}.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`
  const rows = await queryAllium(`
    WITH ix AS (
      SELECT txn_id, instruction_index, data_hex_first16 AS disc
      FROM solana.raw.instructions i
      WHERE i.program_id = '${SOLANA_SUPERGACHA_PROGRAM}'
        AND i.stack_height = 1
        AND i.parent_tx_success = true
        AND i.data_hex_first16 IN (${sqlList([...SPEND_IX, ...REFUND_IX, ...PAYOUT_IX])})
        AND ${timeRange('i')}
    )
    SELECT
      CASE
        WHEN ix.disc IN (${sqlList(SPEND_IX)}) AND t.to_address = '${SOLANA_POOL}' THEN 'spend'
        WHEN ix.disc IN (${sqlList(REFUND_IX)}) AND t.from_address = '${SOLANA_POOL}' THEN 'refund'
        WHEN ix.disc IN (${sqlList(PAYOUT_IX)}) AND t.from_address = '${SOLANA_POOL}' AND t.to_address <> '${SOLANA_REVENUE_OWNER}' THEN 'payout'
      END AS flow,
      SUM(t.raw_amount) AS amount
    FROM solana.assets.transfers t
    JOIN ix ON ix.txn_id = t.txn_id AND ix.instruction_index = t.instruction_index
    WHERE t.mint = '${ADDRESSES.solana.USDC}'
      AND ${timeRange('t')}
      AND (t.to_address = '${SOLANA_POOL}' OR t.from_address = '${SOLANA_POOL}')
    GROUP BY 1
  `)
  let spend = 0n
  let refund = 0n
  let payout = 0n
  for (const row of rows) {
    if (row.flow === 'spend') spend += BigInt(row.amount)
    else if (row.flow === 'refund') refund += BigInt(row.amount)
    else if (row.flow === 'payout') payout += BigInt(row.amount)
  }
  return { spend, payout: payout + refund }
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const buybacks = options.createBalances()
  const isSolana = options.chain === CHAIN.SOLANA
  const usdc = isSolana ? ADDRESSES.solana.USDC : ADDRESSES.base.USDC
  const { spend, payout } = isSolana ? await fetchSolana(options) : await fetchBase(options)
  dailyVolume.add(usdc, spend)
  dailyFees.add(usdc, spend, LABEL_PACK_PURCHASES)
  buybacks.add(usdc, payout)
  dailyFees.subtract(buybacks, LABEL_BUYBACKS)
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Volume:
    'USDC players spend opening Raflux gacha packs of physical trading cards (Super Gacha on Solana, FluxBox on Base), at the full pack price including any part covered by a coupon. Packs are sold at fixed prices of 10, 25, 50 and 100 USDC (1 USDC packs on Base at launch); each pack pulls a physical card, often with a USDC bonus, that the player can ship home or sell back for USDC.',
  Fees: 'Pack purchases minus USDC returned to players: refunds of cancelled pulls, card cash-outs, sell-backs, USDC prizes and reimbursed card shipments. This is the 10% fee Raflux keeps when a card is exchanged for USDC plus the game result of pulls, so it is negative on days when players win more than they pay.',
  Revenue:
    'Pack purchases minus USDC returned to players, kept by Raflux. No share goes to LPs, referrers or token holders.',
  ProtocolRevenue:
    'Pack purchases minus USDC returned to players, all of it sent to the Raflux treasury.',
}

/**
 * allowNegativeValue: prizes, cash-outs and sell-backs paid in an hour can exceed the spin
 * payments of that hour, so Fees and Revenue are legitimately negative on such hours.
 */
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: { start: '2026-08-06' },
    [CHAIN.BASE]: { start: '2026-05-11' },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology: {
    Fees: {
      [LABEL_PACK_PURCHASES]:
        'USDC players spend opening packs, at the full pack price including any part covered by a coupon.',
      [LABEL_BUYBACKS]:
        'USDC returned to players: refunds of cancelled pulls, card cash-outs, sell-backs, USDC prizes and reimbursed card shipments.',
    },
    Revenue: {
      [LABEL_PACK_PURCHASES]:
        'USDC players spend opening packs, kept by Raflux before player payouts.',
      [LABEL_BUYBACKS]:
        'USDC returned to players, subtracted from revenue kept by Raflux.',
    },
    ProtocolRevenue: {
      [LABEL_PACK_PURCHASES]:
        'USDC players spend opening packs, sent to the Raflux treasury before player payouts.',
      [LABEL_BUYBACKS]:
        'USDC returned to players, subtracted from treasury revenue.',
    },
  },
  unknownBreakdownMethodology: PHYSICAL_CARD_COSTS,
  allowNegativeValue: true,
}

export default adapter
