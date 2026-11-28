import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { PHYSICAL_CARD_COSTS } from '../../helpers/physicalCards'

// oripa.xyz: onchain trading-card packs paid in USDC on HyperEVM. All flows are on OripaExchange:
// - DrawDebited: a pack is paid (`cost`); the 5% rip fee (`fee`) goes to $ORIPA stakers right away.
// - DrawRemainder: when the cards are revealed, the contract books the ticket remainder of the rip:
//     remainder = cost - fee - lockedValue x 85%
//   lockedValue is the index price the dealt cards were locked at when the pool was built; the 85% stays in the house bucket
//   as the buyback reserve for those cards (users can melt a card back for 85% of its value). A big hit makes it negative.
// - RemainderPaid: the positive remainder balance is paid to stakers once the house bucket sits above its reserve floor.
// - RewardFunded: a manual top-up the operator can move from the house bucket to stakers. Rare and usually zero: nothing
//   calls it on a schedule. It moves funds the house bucket already holds, so it is not new fees: it is reclassified from
//   protocol revenue to holders revenue (fees/AGENTS.md, accrual basis). Melts are paid at the current index x 85% against the reserve booked at dealing; the
//   difference, positive or negative, stays in the house bucket and is not distributed.
// Fees are pack sales net of the buyback reserve, like other physical card platforms (helpers/physicalCards.ts); gross pack
// sales are reported as volume. We deduct the reserve booked when the cards are dealt, not the melt payouts made later.
const EXCHANGE = '0x66A9212a402746E0D5b9F17Dc80c8101208d684d'
const USDC = ADDRESSES.hyperliquid.USDC

const DRAW_DEBITED = 'event DrawDebited(bytes32 indexed drawRef, address indexed user, bytes32 indexed poolId, uint32 qty, uint256 cost, uint256 fee, uint32 firstSeq)'
const DRAW_REMAINDER = 'event DrawRemainder(bytes32 indexed drawRef, uint256 lockedValue, int256 remainder)'
const REMAINDER_PAID = 'event RemainderPaid(uint256 amount, int256 balance)'
const REWARD_FUNDED = 'event RewardFunded(uint256 amount, uint256 fromHouse)'

const LABEL = {
  PACK_SALES: 'Pack Sales',
  BUYBACK_RESERVE: 'Card Buyback Reserve',
  HOUSE_TOP_UP: 'House Top-up',
  RIP_FEES: 'Rip Fees',
  TICKET_REMAINDER: 'Ticket Remainder',
  REMAINDER_RETAINED: 'Ticket Remainder Retained',
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const [debits, settlements, remainderPaid, rewardFunded] = await Promise.all([
    options.getLogs({ target: EXCHANGE, eventAbi: DRAW_DEBITED }),
    options.getLogs({ target: EXCHANGE, eventAbi: DRAW_REMAINDER }),
    options.getLogs({ target: EXCHANGE, eventAbi: REMAINDER_PAID }),
    options.getLogs({ target: EXCHANGE, eventAbi: REWARD_FUNDED }),
  ])

  // Buyback reserve = cost - fee - remainder (= lockedValue x reserve rate, read from the events instead of hardcoding 85%).
  // A rip is debited and settled seconds apart; one that straddles the hour boundary nets out in the next hour.
  let reserve = 0n
  for (const log of debits) {
    dailyVolume.add(USDC, log.cost)
    dailyFees.add(USDC, log.cost, LABEL.PACK_SALES)
    dailyHoldersRevenue.add(USDC, log.fee, LABEL.RIP_FEES)
    reserve += BigInt(log.cost) - BigInt(log.fee)
  }
  let remainder = 0n
  for (const log of settlements) remainder += BigInt(log.remainder)
  reserve -= remainder
  dailyFees.add(USDC, -reserve, LABEL.BUYBACK_RESERVE)

  let funded = 0n
  for (const log of rewardFunded) {
    dailyHoldersRevenue.add(USDC, log.amount, LABEL.HOUSE_TOP_UP)
    funded += BigInt(log.amount)
  }
  let paid = 0n
  for (const log of remainderPaid) {
    dailyHoldersRevenue.add(USDC, log.amount, LABEL.TICKET_REMAINDER)
    paid += BigInt(log.amount)
  }

  // Revenue - HoldersRevenue = remainder booked - remainder paid - house top-ups: what the house bucket keeps until the
  // remainder balance is paid out (or uses to restock shipped cards), so it is close to zero over time. A top-up is moved
  // from here to holders revenue under the same label, so the label nets instead of showing a separate negative row.
  dailyProtocolRevenue.add(USDC, remainder - paid - funded, LABEL.REMAINDER_RETAINED)

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue, dailyProtocolRevenue }
}

const breakdownFees = {
  [LABEL.PACK_SALES]: 'USDC paid for card packs (DrawDebited cost), including the 5% rip fee.',
  [LABEL.BUYBACK_RESERVE]: 'Buyback reserve set aside when the cards are dealt: 85% of the locked index price of the dealt cards (pack cost minus rip fee minus the DrawRemainder remainder). Users melt cards back against this reserve; later melt payouts are not deducted again.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-11-25',
  // a big hit deals cards worth more than its pack price, so an hour's remainder (and fees) can be negative; the team reports the actual figure
  allowNegativeValue: true,
  methodology: {
    Volume: 'USDC paid for card packs (DrawDebited cost on OripaExchange).',
    Fees: 'Pack sales net of the 85% buyback reserve set aside for the cards dealt. The reserve is booked when the cards are dealt, not when users melt them. Shipping fees are not counted: they pay offchain logistics and handling. Can be negative in an hour with a big hit.',
    Revenue: 'Same as fees. The cost of buying, grading and vaulting the physical cards is paid offchain and not disclosed.',
    HoldersRevenue: 'USDC distributed to $ORIPA stakers: the 5% rip fee on every pack and the ticket remainder paid after settlement, plus any rare manual top-up from the house bucket (moved from protocol revenue, not counted again in fees).',
    ProtocolRevenue: 'Ticket remainder booked but not yet paid to stakers, or used to restock cards users chose to ship, minus any manual top-up moved from the house bucket to stakers. Close to zero over time; negative when a big hit is paid back from later remainders or when a top-up is made.',
  },
  breakdownMethodology: {
    Fees: breakdownFees,
    Revenue: breakdownFees,
    HoldersRevenue: {
      [LABEL.RIP_FEES]: '5% rip fee on every pack, sent to $ORIPA stakers when the pack is paid (DrawDebited fee).',
      [LABEL.TICKET_REMAINDER]: 'Positive ticket remainder paid to $ORIPA stakers after settlement, once the house bucket sits above its reserve floor (RemainderPaid).',
      [LABEL.HOUSE_TOP_UP]: 'Rare manual top-up the operator moves from the house bucket to $ORIPA stakers (RewardFunded); usually zero. Funded from protocol revenue, so it is not added to fees.',
    },
    ProtocolRevenue: {
      [LABEL.REMAINDER_RETAINED]: 'Ticket remainder booked at settlement (DrawRemainder) minus the remainder paid to stakers (RemainderPaid) and minus any manual top-up to stakers (RewardFunded). Includes the restock gap of cards users chose to ship, which buys the replacement physical card offchain.',
    },
  },
  unknownBreakdownMethodology: PHYSICAL_CARD_COSTS,
}

export default adapter
