import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { CARDBOARD_START, fetchCardboardFlows } from '../helpers/cardboard-trade'

// Cardboard Trade: BTC, ETH and SOL perpetuals on Solana, traded against the exchange's own house balance.
// Event decoding and the liquidation rule live in helpers/cardboard-trade.ts.
//
// Fees are the amounts the program records as charged when a position settles: on a close, a 0.5 bp charge on the order
// value plus the market fee (currently 2%) taken from the gain of a winning trade or, on a losing one, from the house's
// gain; on a liquidation, the market fee on the forfeited margin. Opens are free and there is no funding.
// https://docs.cardboardtrade.xyz/payout-factor.html, https://docs.cardboardtrade.xyz/wins-losses.html
//
// Half of the fees funds CARDBOARD staking rewards and referral bonuses, the other half goes to the protocol's fee
// recipient (https://docs.cardboardtrade.xyz/staking.html). The pool's fee_rewards counter grew by exactly 50.0% of the
// event fees between 2026-10-16 08:40 and 2026-10-17 12:39 UTC.
const STAKING_SHARE = 0.5

const LABELS = {
  closeFees: 'Close Fees',
  liquidationFees: 'Liquidation Fees',
  toStakers: 'Trading Fees To CARDBOARD Stakers',
  toProtocol: 'Trading Fees To Protocol',
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  for (const market of await fetchCardboardFlows(options)) {
    // each open and each close is a trade against the house; liquidations are not volume
    dailyVolume.add(ADDRESSES.solana.USDC, market.open_size)
    dailyVolume.add(ADDRESSES.solana.USDC, market.close_size)
    dailyFees.add(ADDRESSES.solana.USDC, market.close_fees, LABELS.closeFees)
    dailyFees.add(ADDRESSES.solana.USDC, market.liquidation_fees, LABELS.liquidationFees)
  }

  const dailyHoldersRevenue = dailyFees.clone(STAKING_SHARE, LABELS.toStakers)
  const dailyProtocolRevenue = dailyFees.clone(1 - STAKING_SHARE, LABELS.toProtocol)
  const dailyRevenue = options.createBalances()
  dailyRevenue.addBalances(dailyHoldersRevenue)
  dailyRevenue.addBalances(dailyProtocolRevenue)

  return {
    //dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: CARDBOARD_START,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    //Volume: 'Notional (margin times leverage) of every position opened, plus the notional at the exit price of every position closed by its owner. Liquidations are not counted.',
    Fees: 'Fees charged when positions settle: a 0.5 basis point close charge on the order value plus the market fee (currently 2%) on the gain of winning trades and on the loss of losing and liquidated trades. Opening a position is free and there are no funding payments.',
    Revenue: 'All settlement fees, split between the protocol and CARDBOARD stakers.',
    ProtocolRevenue: 'Half of settlement fees, allocated to the protocol fee recipient.',
    HoldersRevenue: 'Half of settlement fees, distributed in USDC to CARDBOARD stakers. Referral bonuses are paid from the same budget and are not separated.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.closeFees]: 'Fees on positions closed by their owner: the 0.5 basis point close charge on the order value plus the market fee on the gain of a winning trade or on the house\'s gain from a losing one.',
      [LABELS.liquidationFees]: 'Market fee on the margin forfeited by liquidated positions, including closes that executed past the bust price.',
    },
    Revenue: {
      [LABELS.toStakers]: 'Half of settlement fees, put into the USDC rewards budget for CARDBOARD stakers.',
      [LABELS.toProtocol]: 'Half of settlement fees, allocated to the protocol fee recipient.',
    },
    ProtocolRevenue: {
      [LABELS.toProtocol]: 'Half of settlement fees, allocated to the protocol fee recipient.',
    },
    HoldersRevenue: {
      [LABELS.toStakers]: 'Half of settlement fees, put into the USDC rewards budget for CARDBOARD stakers.',
    },
  },
}

export default adapter
