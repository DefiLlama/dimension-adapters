import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Somnex perps is a GMX v1 fork. Every position change and fee collection is emitted by an EventLogger contract
const eventLoggers = [
  // original deployment, last event 2025-12-16 02:39 UTC (block 178379198)
  { address: '0x84261893C8048074A65f46CE6BfFaBA6c2370219', until: '2025-12-17' },
  // created 2025-12-07, shared by the Dec 2025 and Feb 2026 redeployments
  { address: '0xD6c185ac5bD4079E74EaE1D2d2AA663807C8562b', since: '2025-12-07' },
]
const toUnixTime = (date: string) => Date.parse(date) / 1000

// SOMNIA_ARCHIVAL_RPC (blockscout eth-rpc) silently truncates getLogs at 1000 logs, so keep each request small
const maxBlockRange = 10000

const increasePositionEvent = 'event IncreasePosition(bytes32 key, address account, address poolToken, address collateralToken, address indexToken, uint256 collateralDeltaUsd, uint256 sizeDelta, bool isLong, uint256 price, uint256 fee)'
const decreasePositionEvent = 'event DecreasePosition(bytes32 key, address account, address poolToken, address collateralToken, address indexToken, uint256 collateralDelta, uint256 sizeDelta, bool isLong, uint256 price, uint256 fee)'
const liquidatePositionEvent = 'event LiquidatePosition(bytes32 key, address account, address poolToken, address collateralToken, address indexToken, bool isLong, uint256 size, uint256 collateral, uint256 reserveAmount, int256 realisedPnl, uint256 markPrice)'
// feeUsd covers position open/close fees, borrow fees and the funding the trader pays, including on liquidations
const collectMarginFeesEvent = 'event CollectMarginFees(address poolToken, address token, uint256 feeUsd, uint256 feeTokens)'
// funding paid (isClaim = false) is part of CollectMarginFees but is passed to the traders on the other side (ClaimFeesFunding)
const collectFundingFeesEvent = 'event CollectFundingFees(address poolToken, address token, uint256 feeUsd, uint256 feeTokens, address account, bool isClaim)'
// emitted by the liquidity pool on every BuyUSDG/SellUSDG (SPLP mint/redeem) and pool swap
const collectSwapFeesEvent = 'event CollectSwapFees(address poolToken, address token, uint256 feeUsd, uint256 feeTokens)'
// referral payouts are funded from the protocol's half of the fees
const settleReferralRebateEvent = 'event SettleReferralRebate(bytes32 code, address poolToken, address token, uint256 amountUsd, address receiver)'
const claimReferralDiscountEvent = 'event ClaimReferralDiscount(bytes32 code, address poolToken, address token, uint256 amountUsd, address receiver)'

// half of every fee net of funding is added to the SPLP pool (IncreasePoolAmount in the same tx), the rest stays with the
// protocol and is claimed by the team wallet 0xD6D8fF3a7eDd53D19Bc2ba4f4EBd5c5A636d0950 (ClaimFeesTeam)
const lpShare = 0.5

const LABELS = {
  MARGIN_FEES_TO_LPS: 'Margin Fees To LPs',
  MINT_REDEEM_FEES_TO_LPS: 'Mint/Redeem Fees To LPs',
  REFERRAL_REBATES: 'Referral Rebates',
  TRADER_DISCOUNTS: 'Referral Trader Discounts',
  MARGIN_FEES_TO_PROTOCOL: 'Margin Fees To Protocol',
  MINT_REDEEM_FEES_TO_PROTOCOL: 'Mint/Redeem Fees To Protocol',
}

// USD values in the events use 30 decimals
const toUsd = (value: bigint | string) => Number(value) / 1e30
const sumUsd = (logs: any[], field: string) => logs.reduce((sum, log) => sum + toUsd(log[field]), 0)

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  const targets = eventLoggers
    .filter(({ since, until }) => (!since || options.endTimestamp > toUnixTime(since)) && (!until || options.startTimestamp < toUnixTime(until)))
    .map(({ address }) => address)
  const getLogs = (eventAbi: string) => options.getLogs({ targets, eventAbi, maxBlockRange })
  const increaseLogs = await getLogs(increasePositionEvent)
  const decreaseLogs = await getLogs(decreasePositionEvent)
  const liquidateLogs = await getLogs(liquidatePositionEvent)
  const marginFeeLogs = await getLogs(collectMarginFeesEvent)
  const fundingLogs = await getLogs(collectFundingFeesEvent)
  const swapFeeLogs = await getLogs(collectSwapFeesEvent)
  const rebateLogs = await getLogs(settleReferralRebateEvent)
  const discountLogs = await getLogs(claimReferralDiscountEvent)

  increaseLogs.forEach((log: any) => dailyVolume.addUSDValue(toUsd(log.sizeDelta)))
  decreaseLogs.forEach((log: any) => dailyVolume.addUSDValue(toUsd(log.sizeDelta)))
  liquidateLogs.forEach((log: any) => dailyVolume.addUSDValue(toUsd(log.size)))

  const fundingPaid = sumUsd(fundingLogs.filter((log: any) => !log.isClaim), 'feeUsd')
  const marginFees = sumUsd(marginFeeLogs, 'feeUsd') - fundingPaid
  const mintRedeemFees = sumUsd(swapFeeLogs, 'feeUsd')
  const referralRebates = sumUsd(rebateLogs, 'amountUsd')
  const traderDiscounts = sumUsd(discountLogs, 'amountUsd')

  dailyFees.addUSDValue(marginFees, METRIC.MARGIN_FEES)
  dailyFees.addUSDValue(mintRedeemFees, METRIC.MINT_REDEEM_FEES)

  dailySupplySideRevenue.addUSDValue(marginFees * lpShare, LABELS.MARGIN_FEES_TO_LPS)
  dailySupplySideRevenue.addUSDValue(mintRedeemFees * lpShare, LABELS.MINT_REDEEM_FEES_TO_LPS)
  dailySupplySideRevenue.addUSDValue(referralRebates, LABELS.REFERRAL_REBATES)
  dailySupplySideRevenue.addUSDValue(traderDiscounts, LABELS.TRADER_DISCOUNTS)

  dailyRevenue.addUSDValue(marginFees * (1 - lpShare) - referralRebates - traderDiscounts, LABELS.MARGIN_FEES_TO_PROTOCOL)
  dailyRevenue.addUSDValue(mintRedeemFees * (1 - lpShare), LABELS.MINT_REDEEM_FEES_TO_PROTOCOL)

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOMNIA],
  start: '2025-09-02',
  methodology: {
    Volume: 'Notional size of perpetual positions opened, closed and liquidated on Somnex.',
    Fees: 'Position open/close fees and borrow fees paid by traders (including on liquidations), plus fees charged when liquidity is added to or removed from the SPLP pool. Funding paid between traders is excluded.',
    SupplySideRevenue: 'Half of all fees, added to the SPLP liquidity pool, plus referral rebates to referrers and fee discounts to referred traders.',
    Revenue: 'Half of all fees, kept by the protocol, minus referral rebates and referred-trader discounts.',
    ProtocolRevenue: 'Half of all fees minus referral payouts, claimed by the Somnex team wallet.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MARGIN_FEES]: 'Position open/close fees and borrow fees paid by traders, including fees taken on liquidations.',
      [METRIC.MINT_REDEEM_FEES]: 'Fees charged when liquidity is added to or removed from the SPLP pool, and on token swaps through the pool.',
    },
    SupplySideRevenue: {
      [LABELS.MARGIN_FEES_TO_LPS]: 'Half of position and borrow fees, added to the SPLP liquidity pool.',
      [LABELS.MINT_REDEEM_FEES_TO_LPS]: 'Half of SPLP mint/redeem and pool swap fees, added to the SPLP liquidity pool.',
      [LABELS.REFERRAL_REBATES]: 'Rebates paid to referrers out of the protocol share of trading fees.',
      [LABELS.TRADER_DISCOUNTS]: 'Fee discounts returned to referred traders out of the protocol share of trading fees.',
    },
    Revenue: {
      [LABELS.MARGIN_FEES_TO_PROTOCOL]: 'Half of position and borrow fees, minus referral rebates and referred-trader discounts.',
      [LABELS.MINT_REDEEM_FEES_TO_PROTOCOL]: 'Half of SPLP mint/redeem and pool swap fees.',
    },
    ProtocolRevenue: {
      [LABELS.MARGIN_FEES_TO_PROTOCOL]: 'Half of position and borrow fees, minus referral rebates and referred-trader discounts, claimed by the team wallet.',
      [LABELS.MINT_REDEEM_FEES_TO_PROTOCOL]: 'Half of SPLP mint/redeem and pool swap fees, claimed by the team wallet.',
    },
  },
}

export default adapter
