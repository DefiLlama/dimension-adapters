import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import { EVENTS, VAULT, usd30 } from '../helpers/zeustrade'

// PositionRouter: https://basescan.org/address/0xBE341A6683124193926ACd71b69dCDdE3cc37e60
// PositionManager: https://basescan.org/address/0x9fFa6a29a80e89354629ACD6567d874c5D2AA096
// Both keep their collateral fee (depositFee) in feeReserves(token). Only the
// admin Safe can withdraw it; it is not sent to LPs.
const POSITION_MANAGERS = ['0xBE341A6683124193926ACd71b69dCDdE3cc37e60', '0x9fFa6a29a80e89354629ACD6567d874c5D2AA096']

// Accounts that swap the fees withdrawn from the Vault into USDC before they are
// sent to LPs. The fee of such a swap stays in the Vault and reaches the same LPs
// with the next distribution, so counting it would count one payment twice.
// Old fee distributor key, until 2026-11-05: https://basescan.org/address/0x70CD61AD2Ae8D1e304458451dcf59e50786c3A85
// Fee distributor key, 2026-11-06 to 2026-11-15: https://basescan.org/address/0x207FE94EA9b8ED48fE535ABE2995dE053d393f78
// FeeCollector, since 2026-11-16: https://basescan.org/address/0x97cc47CB5cb503B855D75504a200DFddC7D57596
const FEE_CONVERSION_ACCOUNTS = new Set([
  '0x70cd61ad2ae8d1e304458451dcf59e50786c3a85',
  '0x207fe94ea9b8ed48fe535abe2995de053d393f78',
  '0x97cc47cb5cb503b855d75504a200dfddc7d57596',
])

const BASIS_POINTS = 10000n

const LABEL = {
  COLLATERAL_FEES: 'Collateral Fees',
  MARGIN_FEES_TO_LPS: 'Margin Fees To ZLP Holders',
  SWAP_FEES_TO_LPS: 'Swap Fees To ZLP Holders',
  MINT_REDEEM_FEES_TO_LPS: 'Mint/Redeem Fees To ZLP Holders',
  LIQUIDATION_FEES_TO_KEEPER: 'Liquidation Fees To Liquidation Keeper',
  COLLATERAL_FEES_TO_PROTOCOL: 'Collateral Fees To Protocol',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  // token = null means the amount is already in USD
  const addFee = (token: string | null, amount: bigint | number, source: string, destination: string, isRevenue: boolean) => {
    const target = isRevenue ? dailyRevenue : dailySupplySideRevenue
    for (const [balances, label] of [[dailyFees, source], [target, destination]] as const) {
      if (token) balances.add(token, amount.toString(), label)
      else balances.addUSDValue(Number(amount), label)
    }
  }

  // Position fee (0.1% of the size change when a keeper executes) plus the
  // hourly borrow fee, charged on every increase, decrease and liquidation.
  const marginFees = await options.getLogs({ target: VAULT, eventAbi: EVENTS.collectMarginFees })
  marginFees.forEach((log: any) => addFee(null, usd30(log.feeUsd), METRIC.MARGIN_FEES, LABEL.MARGIN_FEES_TO_LPS, false))

  // Vault swap fee, taken from tokenOut: amountOut - amountOutAfterFees.
  const swaps = await options.getLogs({ target: VAULT, eventAbi: EVENTS.swap })
  swaps.forEach((log: any) => {
    if (FEE_CONVERSION_ACCOUNTS.has(log.account.toLowerCase())) return
    addFee(log.tokenOut, BigInt(log.amountOut) - BigInt(log.amountOutAfterFees), METRIC.SWAP_FEES, LABEL.SWAP_FEES_TO_LPS, false)
  })

  // ZLP mint fee, taken from tokenAmount the same way Vault.buyUSDG does.
  const mints = await options.getLogs({ target: VAULT, eventAbi: EVENTS.buyUSDG })
  mints.forEach((log: any) => {
    const amount = BigInt(log.tokenAmount)
    const fee = amount - amount * (BASIS_POINTS - BigInt(log.feeBasisPoints)) / BASIS_POINTS
    addFee(log.token, fee, METRIC.MINT_REDEEM_FEES, LABEL.MINT_REDEEM_FEES_TO_LPS, false)
  })

  // ZLP redeem fee: SellUSDG reports the amount after the fee, rounded up back to the fee.
  const redeems = await options.getLogs({ target: VAULT, eventAbi: EVENTS.sellUSDG })
  redeems.forEach((log: any) => {
    const bps = BigInt(log.feeBasisPoints)
    const fee = (BigInt(log.tokenAmount) * bps + BASIS_POINTS - bps - 1n) / (BASIS_POINTS - bps)
    addFee(log.token, fee, METRIC.MINT_REDEEM_FEES, LABEL.MINT_REDEEM_FEES_TO_LPS, false)
  })

  // Flat liquidation fee (liquidationFeeUsd, $5 since launch) paid out of the
  // liquidated collateral to the fee receiver of the ZEUS liquidation keeper.
  const liquidations = await options.getLogs({ target: VAULT, eventAbi: EVENTS.liquidatePosition })
  if (liquidations.length) {
    const liquidationFeeUsd = await options.toApi.call({ target: VAULT, abi: 'uint256:liquidationFeeUsd' })
    addFee(null, usd30(liquidationFeeUsd) * liquidations.length, METRIC.LIQUIDATION_FEES, LABEL.LIQUIDATION_FEES_TO_KEEPER, true)
  }

  // Collateral fee (depositFee, 0.3% on the PositionRouter) when collateral is
  // added without a matching size increase. There is no event for it, so it is
  // the growth of feeReserves over the period. withdrawFees by the admin emits no
  // event either: a window with a withdrawal undercounts the fees of that window.
  const tokens: string[] = await options.toApi.fetchList({
    target: VAULT,
    lengthAbi: 'uint256:allWhitelistedTokensLength',
    itemAbi: 'function allWhitelistedTokens(uint256) view returns (address)',
  })
  const calls = POSITION_MANAGERS.flatMap((target) => tokens.map((token: string) => ({ target, params: [token] })))
  const before = await options.fromApi.multiCall({ abi: 'function feeReserves(address) view returns (uint256)', calls })
  const after = await options.toApi.multiCall({ abi: 'function feeReserves(address) view returns (uint256)', calls })
  calls.forEach((call, i) => {
    const growth = BigInt(after[i]) - BigInt(before[i])
    if (growth > 0n) addFee(call.params[0], growth, LABEL.COLLATERAL_FEES, LABEL.COLLATERAL_FEES_TO_PROTOCOL, true)
  })

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-04-27',
  methodology: {
    Fees: 'Margin fees (position and borrow fees), Vault swap fees, ZLP mint and redeem fees, liquidation fees and PositionRouter collateral fees paid by users. Keeper execution fees in ETH are gas refunds and are not counted. Swaps that convert collected fees into USDC are excluded.',
    UserFees: 'All fees are paid by traders and liquidity providers.',
    SupplySideRevenue: 'All margin, swap, mint and redeem fees collected in the Vault are distributed to ZLP holders (fZLP stakers) in USDC.',
    Revenue: 'Liquidation fees paid to the ZEUS liquidation keeper and collateral fees held by the PositionRouter and PositionManager.',
    ProtocolRevenue: 'Liquidation fees paid to the ZEUS liquidation keeper and collateral fees held by the PositionRouter and PositionManager.',
    HoldersRevenue: 'No fees go to ZUS token holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MARGIN_FEES]: 'Position fee on every executed size change plus the hourly borrow fee, from Vault CollectMarginFees events.',
      [METRIC.SWAP_FEES]: 'Fee of Vault swaps by users, taken from the output token.',
      [METRIC.MINT_REDEEM_FEES]: 'Fee paid when liquidity providers mint or redeem ZLP.',
      [METRIC.LIQUIDATION_FEES]: 'Flat liquidation fee per liquidated position.',
      [LABEL.COLLATERAL_FEES]: 'PositionRouter and PositionManager fee on collateral added without a matching size increase, read as the growth of their feeReserves (a window in which the admin withdraws them is undercounted).',
    },
    UserFees: {
      [METRIC.MARGIN_FEES]: 'Position and borrow fees paid by traders.',
      [METRIC.SWAP_FEES]: 'Swap fees paid by users.',
      [METRIC.MINT_REDEEM_FEES]: 'Mint and redeem fees paid by liquidity providers.',
      [METRIC.LIQUIDATION_FEES]: 'Liquidation fees paid from the collateral of liquidated traders.',
      [LABEL.COLLATERAL_FEES]: 'Collateral fees paid by traders.',
    },
    SupplySideRevenue: {
      [LABEL.MARGIN_FEES_TO_LPS]: 'All margin fees go to ZLP holders.',
      [LABEL.SWAP_FEES_TO_LPS]: 'All swap fees go to ZLP holders.',
      [LABEL.MINT_REDEEM_FEES_TO_LPS]: 'All mint and redeem fees go to ZLP holders.',
    },
    Revenue: {
      [LABEL.LIQUIDATION_FEES_TO_KEEPER]: 'Liquidation fees go to the fee receiver of the ZEUS liquidation keeper, which pays the gas.',
      [LABEL.COLLATERAL_FEES_TO_PROTOCOL]: 'Collateral fees stay in the PositionRouter and PositionManager until the admin Safe withdraws them.',
    },
    ProtocolRevenue: {
      [LABEL.LIQUIDATION_FEES_TO_KEEPER]: 'Liquidation fees go to the fee receiver of the ZEUS liquidation keeper, which pays the gas.',
      [LABEL.COLLATERAL_FEES_TO_PROTOCOL]: 'Collateral fees stay in the PositionRouter and PositionManager until the admin Safe withdraws them.',
    },
  },
}

export default adapter
