import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { addTokensReceived } from '../../helpers/token'

// PRIVO (https://privoexchange.com, https://x.com/privoexchange): a trading app on Robinhood Chain.
// Source: https://github.com/privoexchange/privoperps
// Every on-chain PRIVO fee goes to one dedicated fee Safe (2 of 3), which receives nothing else:
//   - Spot swaps and baskets through the Uniswap Universal Router: 0.15% of the USDG side, paid by
//     PAY_PORTION from the router or by a Permit2 transfer from the trader, in the swap the trader signs.
//   - Limit orders and TWAP (PrivoOrders): 0.15% of the USDG leg, pulled from the maker on each fill.
//   - Block desk (PrivoBlockDesk): 0.10% of the USDG leg, or of the taker leg when neither side is USDG.
// The fee wallet is a constant in both contracts (FEE_WALLET) and in the app's swap config.
// The swaps themselves, and their LP fees, are counted by Uniswap; perps run on Orderly and their
// builder fees are settled by Orderly off chain, so neither is counted here.
const FEE_SAFE = '0xCc051cf47547386bA147FDDfcBCFE00E791C1418'
const BLOCK_DESK = '0x8D94fCe2925EBA2448DA28f9461c8b644c26b8e7'
const USDG = ADDRESSES.robinhood.USDG
const SETTLED = 'event Settled(bytes32 indexed blockId, address indexed maker, address indexed taker, address makerToken, uint256 makerAmount, address takerToken, uint256 takerAmount, address feeToken, uint256 fee)'

const LABEL = {
  USDG_FEES: 'Trading Fees In USDG',
  DESK_FEES: 'Block Desk Fees In Other Tokens',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  // Spot, basket, order and USDG block desk fees: all USDG that reaches the fee Safe.
  const usdg = await addTokensReceived({ options, target: FEE_SAFE, token: USDG })
  dailyFees.addBalances(usdg, LABEL.USDG_FEES)

  // Block desk trades with no USDG leg pay the fee in the taker's token; read it from Settled.
  const settled = await options.getLogs({ target: BLOCK_DESK, eventAbi: SETTLED })
  for (const log of settled) {
    if (String(log.feeToken).toLowerCase() === USDG.toLowerCase()) continue
    dailyFees.add(log.feeToken, log.fee, LABEL.DESK_FEES)
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-11-17',
  methodology: {
    Fees: 'Fees PRIVO charges on Robinhood Chain: 0.15% of the USDG side of spot swaps, baskets, limit orders and TWAP fills, and 0.10% of block desk trades, all paid on chain to the PRIVO fee Safe.',
    Revenue: 'PRIVO keeps all of these fees.',
    ProtocolRevenue: 'All fees go to the PRIVO fee Safe.',
  },
  breakdownMethodology: {
    Fees: {
      [LABEL.USDG_FEES]: 'USDG received by the PRIVO fee Safe from spot swaps, baskets, limit and TWAP fills and USDG block desk trades.',
      [LABEL.DESK_FEES]: 'Block desk fees paid in the taker token when neither leg is USDG, read from the Settled event.',
    },
    Revenue: {
      [LABEL.USDG_FEES]: 'All USDG trading fees are kept by PRIVO.',
      [LABEL.DESK_FEES]: 'All block desk fees are kept by PRIVO.',
    },
    ProtocolRevenue: {
      [LABEL.USDG_FEES]: 'All USDG trading fees go to the PRIVO fee Safe.',
      [LABEL.DESK_FEES]: 'All block desk fees go to the PRIVO fee Safe.',
    },
  },
}

export default adapter
