import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import { getPositionedLogArgs } from '../helpers/logs'
import { EVENTS, VAULT, usd30 } from '../helpers/zeustrade'

// PositionRouter: https://basescan.org/address/0xBE341A6683124193926ACd71b69dCDdE3cc37e60
// PositionManager: https://basescan.org/address/0x9fFa6a29a80e89354629ACD6567d874c5D2AA096
// Both keep their collateral fee (depositFee) in feeReserves(token). Only the
// admin Safe can withdraw it; it is not sent to LPs.
const POSITION_MANAGERS = ['0xBE341A6683124193926ACd71b69dCDdE3cc37e60', '0x9fFa6a29a80e89354629ACD6567d874c5D2AA096']

// Accounts that swap previously collected Vault fees into USDC for distribution.
// The conversion fee stays in the Vault as carry-over. Including it here would
// count it as a second user payment.
// Old fee distributor key, until 2026-11-05: https://basescan.org/address/0x70CD61AD2Ae8D1e304458451dcf59e50786c3A85
// Fee distributor key, 2026-11-06 to 2026-11-15: https://basescan.org/address/0x207FE94EA9b8ED48fE535ABE2995dE053d393f78
// FeeCollector V1, from 2026-11-16 until the cutover: https://basescan.org/address/0x97cc47CB5cb503B855D75504a200DFddC7D57596
// FeeCollector V2 first production collection, 2026-11-27: https://basescan.org/tx/0x1cc07a8f4e6670c23927b8924bc830229aa708ac210a39b979ce968593b0c677
const FEE_CONVERSION_ACCOUNTS = new Set([
  '0x70cd61ad2ae8d1e304458451dcf59e50786c3a85',
  '0x207fe94ea9b8ed48fe535abe2995de053d393f78',
  '0x97cc47cb5cb503b855d75504a200dfddc7d57596',
  '0x5223d9586ba97997c3a18655d8af5a2ff1197acf',
])

const BASIS_POINTS = 10000n
// Safe cutover enabling V2 and revoking V1 on 2026-11-27 at 03:25:06 UTC:
// https://basescan.org/tx/0xb156bdabbf9c1c30bc70fbec51245db15814698611a146da04389d11db87fdd7
const FEE_SPLIT_START_BLOCK = 62797653
const LP_SHARE_BPS = 7000n
const RISK_RESERVE_SHARE_BPS = 1000n

const LABEL = {
  COLLATERAL_FEES: 'Collateral Fees',
  MARGIN_FEES_TO_LPS: 'Margin Fees To ZLP Holders',
  SWAP_FEES_TO_LPS: 'Swap Fees To ZLP Holders',
  MINT_REDEEM_FEES_TO_LPS: 'Mint/Redeem Fees To ZLP Holders',
  LIQUIDATION_FEES_TO_KEEPER: 'Liquidation Fees To Liquidation Keeper',
  COLLATERAL_FEES_TO_PROTOCOL: 'Collateral Fees To Protocol',
  VAULT_FEES_TO_RISK_RESERVE: 'Vault Fees To Risk Reserve',
  VAULT_FEES_TO_OPERATING_TREASURY: 'Vault Fees To Operating Treasury',
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  // A null token denotes a USD value with the Vault's 30 decimals.
  const addAmount = (balances: typeof dailyFees, token: string | null, amount: bigint, label: string) => {
    if (token) balances.add(token, amount.toString(), label)
    else balances.addUSDValue(usd30(amount), label)
  }

  const addVaultFee = (blockNumber: number, token: string, amount: bigint, source: string, lpLabel: string) => {
    addAmount(dailyFees, token, amount, source)

    // Allocate on the accrual block. The first V2 payout may also settle earlier accruals.
    if (blockNumber < FEE_SPLIT_START_BLOCK) {
      addAmount(dailySupplySideRevenue, token, amount, lpLabel)
      return
    }
    const lpShare = amount * LP_SHARE_BPS / BASIS_POINTS
    const riskReserveShare = amount * RISK_RESERVE_SHARE_BPS / BASIS_POINTS
    const treasuryShare = amount - lpShare - riskReserveShare
    addAmount(dailySupplySideRevenue, token, lpShare, lpLabel)
    addAmount(dailyRevenue, token, riskReserveShare, LABEL.VAULT_FEES_TO_RISK_RESERVE)
    addAmount(dailyRevenue, token, treasuryShare, LABEL.VAULT_FEES_TO_OPERATING_TREASURY)
  }

  const addProtocolFee = (token: string | null, amount: bigint, source: string, destination: string) => {
    addAmount(dailyFees, token, amount, source)
    addAmount(dailyRevenue, token, amount, destination)
  }

  // Position fee (0.1% of the size change when a keeper executes) plus the
  // hourly borrow fee, charged on every increase, decrease and liquidation.
  // Use the emitted token debit so pricing reflects what the Vault collected.
  const marginFees = await getPositionedLogArgs(options, { target: VAULT, eventAbi: EVENTS.collectMarginFees })
  marginFees.forEach((log) => addVaultFee(log.blockNumber, log.token, BigInt(log.feeTokens), METRIC.MARGIN_FEES, LABEL.MARGIN_FEES_TO_LPS))

  // Vault swap fee, taken from tokenOut: amountOut - amountOutAfterFees.
  const swaps = await getPositionedLogArgs(options, { target: VAULT, eventAbi: EVENTS.swap })
  swaps.forEach((log) => {
    if (FEE_CONVERSION_ACCOUNTS.has(log.account.toLowerCase())) return
    addVaultFee(log.blockNumber, log.tokenOut, BigInt(log.amountOut) - BigInt(log.amountOutAfterFees), METRIC.SWAP_FEES, LABEL.SWAP_FEES_TO_LPS)
  })

  // ZLP mint fee, taken from tokenAmount the same way Vault.buyUSDG does.
  const mints = await getPositionedLogArgs(options, { target: VAULT, eventAbi: EVENTS.buyUSDG })
  mints.forEach((log) => {
    const amount = BigInt(log.tokenAmount)
    const fee = amount - amount * (BASIS_POINTS - BigInt(log.feeBasisPoints)) / BASIS_POINTS
    addVaultFee(log.blockNumber, log.token, fee, METRIC.MINT_REDEEM_FEES, LABEL.MINT_REDEEM_FEES_TO_LPS)
  })

  // ZLP redeem fee: SellUSDG reports the amount after the fee, rounded up back to the fee.
  const redeems = await getPositionedLogArgs(options, { target: VAULT, eventAbi: EVENTS.sellUSDG })
  redeems.forEach((log) => {
    const bps = BigInt(log.feeBasisPoints)
    const fee = (BigInt(log.tokenAmount) * bps + BASIS_POINTS - bps - 1n) / (BASIS_POINTS - bps)
    addVaultFee(log.blockNumber, log.token, fee, METRIC.MINT_REDEEM_FEES, LABEL.MINT_REDEEM_FEES_TO_LPS)
  })

  // Flat liquidation fee (liquidationFeeUsd, $5 since launch) paid out of the
  // liquidated collateral to the fee receiver of the ZEUS liquidation keeper.
  const liquidations = await options.getLogs({ target: VAULT, eventAbi: EVENTS.liquidatePosition })
  if (liquidations.length) {
    const liquidationFeeUsd = await options.toApi.call({ target: VAULT, abi: 'uint256:liquidationFeeUsd' })
    addProtocolFee(null, BigInt(liquidationFeeUsd) * BigInt(liquidations.length), METRIC.LIQUIDATION_FEES, LABEL.LIQUIDATION_FEES_TO_KEEPER)
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
    if (growth > 0n) addProtocolFee(call.params[0], growth, LABEL.COLLATERAL_FEES, LABEL.COLLATERAL_FEES_TO_PROTOCOL)
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
  // First Vault fee, Base block 45253202:
  // https://basescan.org/tx/0x28f0c7fa86f87d47511b90e63a827a137538bef05658bd8d84f52b3bfe546a3a
  start: '2026-04-27T13:15:51Z',
  methodology: {
    Fees: 'Margin fees (position and borrow fees), Vault swap fees, ZLP mint and redeem fees, liquidation fees and PositionRouter collateral fees paid by users. Keeper execution fees in ETH are gas refunds and are not counted. Swaps that convert collected fees into USDC are excluded.',
    UserFees: 'All fees are paid by traders and liquidity providers.',
    SupplySideRevenue: 'The adapter attributes 100% of Vault fee accruals to ZLP holders before the V2 cutover and 70% from the cutover onward. USDC settlements can include earlier accruals.',
    Revenue: 'The risk reserve and operating treasury shares of V2 Vault fee accruals, liquidation fees paid to the ZEUS liquidation keeper, and collateral fees held by the PositionRouter and PositionManager.',
    ProtocolRevenue: 'The risk reserve and operating treasury shares of V2 Vault fee accruals, liquidation fees paid to the ZEUS liquidation keeper, and collateral fees held by the PositionRouter and PositionManager.',
    HoldersRevenue: 'No fees go to ZUS token holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MARGIN_FEES]: 'Position and borrow fees in the tokens charged, from CollectMarginFees.feeTokens.',
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
      [LABEL.MARGIN_FEES_TO_LPS]: '100% of margin fees before the cutover and 70% from the cutover onward.',
      [LABEL.SWAP_FEES_TO_LPS]: '100% of user swap fees before the cutover and 70% from the cutover onward.',
      [LABEL.MINT_REDEEM_FEES_TO_LPS]: '100% of mint and redeem fees before the cutover and 70% from the cutover onward.',
    },
    Revenue: {
      [LABEL.LIQUIDATION_FEES_TO_KEEPER]: 'Liquidation fees go to the fee receiver of the ZEUS liquidation keeper, which pays the gas.',
      [LABEL.COLLATERAL_FEES_TO_PROTOCOL]: 'Collateral fees stay in the PositionRouter and PositionManager until the admin Safe withdraws them.',
      [LABEL.VAULT_FEES_TO_RISK_RESERVE]: '10% of margin, user swap, mint and redeem fees from the V2 cutover.',
      [LABEL.VAULT_FEES_TO_OPERATING_TREASURY]: 'The remaining 20% of Vault fees from the V2 cutover, including rounding remainders.',
    },
    ProtocolRevenue: {
      [LABEL.LIQUIDATION_FEES_TO_KEEPER]: 'Liquidation fees go to the fee receiver of the ZEUS liquidation keeper, which pays the gas.',
      [LABEL.COLLATERAL_FEES_TO_PROTOCOL]: 'Collateral fees stay in the PositionRouter and PositionManager until the admin Safe withdraws them.',
      [LABEL.VAULT_FEES_TO_RISK_RESERVE]: '10% of margin, user swap, mint and redeem fees from the V2 cutover.',
      [LABEL.VAULT_FEES_TO_OPERATING_TREASURY]: 'The remaining 20% of Vault fees from the V2 cutover, including rounding remainders.',
    },
  },
}

export default adapter
