import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Nova's markets on Arbitrum: one trading contract (a diamond), with the Conviction Pool (nUSDC vault) taking the
// other side of every trade.
// Source: https://docs.nova.markets/contracts.md
const DIAMOND = "0x1410FA3F87F6A6ea221E5D2aB608C23005eC34f3";

// PendingOrderType.LIQ_CLOSE in the diamond. A liquidation is not counted as volume; its closing fee is still a fee.
const LIQ_CLOSE = 6;

const ABI = {
  getCollaterals:
    "function getCollaterals() view returns ((address collateral, bool isActive, uint88 __placeholder, uint128 precision, uint128 precisionDelta)[])",
  // Emitted once per fee-paying execution: market and limit opens, closes, TP/SL, liquidations and partial size changes.
  FeesProcessed:
    "event FeesProcessed(uint8 indexed collateralIndex, address indexed trader, uint256 positionSizeCollateral, uint8 orderType, uint256 totalFeesCollateral)",
  // The opening and closing fee is split by TradingCommonUtils.processFees into the events below, which add up to it.
  // Kept by the protocol: pendingGovFees, collected by Nova.
  GovFeeCharged: "event GovFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  // Kept by the protocol: the OTC share. Nova has no token and sets it to the 0.001% minimum the contract allows.
  GnsOtcFeeCharged: "event GnsOtcFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  // Sent to the Conviction Pool.
  GTokenFeeCharged: "event GTokenFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  GTokenOcFeeCharged: "event GTokenOcFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  // Referral and trigger fees: the collateral is also transferred to the Conviction Pool (transferFeeToVault).
  ReferralFeeCharged: "event ReferralFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  TriggerFeeCharged: "event TriggerFeeCharged(address indexed trader, uint8 indexed collateralIndex, uint256 amountCollateral)",
  // Holding fees, charged when they are sent to the Conviction Pool. The funding part is paid between traders, not kept.
  HoldingFeesChargedOnTrade:
    "event HoldingFeesChargedOnTrade(uint8 indexed collateralIndex, address indexed trader, uint32 indexed index, uint64 currentPairPrice, (int256 fundingFeeCollateral, uint256 borrowingFeeCollateral, uint256 borrowingFeeCollateral_old, int256 totalFeeCollateral) tradeHoldingFees, uint256 availableCollateralInDiamond, uint256 amountSentToVaultCollateral, uint256 newRealizedTradingFeesCollateral, int256 newRealizedPnlCollateral)",
};

const LABELS = {
  TradingFees: METRIC.OPEN_CLOSE_FEES,
  BorrowingFees: "Borrowing Fees",
  TradingFeesToProtocol: "Open/Close Fees To Protocol",
  TradingFeesToPool: "Open/Close Fees To Conviction Pool",
  BorrowingFeesToPool: "Borrowing Fees To Conviction Pool",
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, api } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // collateralIndex is 1-based: getCollaterals()[i] is collateral index i + 1. USDC is the only one today.
  const collaterals = await api.call({ target: DIAMOND, abi: ABI.getCollaterals });
  const token = (collateralIndex: any) => collaterals[Number(collateralIndex) - 1].collateral;

  const [processed, gov, gnsOtc, gToken, gTokenOc, referral, trigger, holding] = await Promise.all(
    [
      ABI.FeesProcessed,
      ABI.GovFeeCharged,
      ABI.GnsOtcFeeCharged,
      ABI.GTokenFeeCharged,
      ABI.GTokenOcFeeCharged,
      ABI.ReferralFeeCharged,
      ABI.TriggerFeeCharged,
      ABI.HoldingFeesChargedOnTrade,
    ].map((eventAbi) => getLogs({ target: DIAMOND, eventAbi }))
  );

  // positionSizeCollateral is the notional (collateral x leverage) in collateral units.
  processed.forEach((log: any) => {
    if (Number(log.orderType) === LIQ_CLOSE) return;
    dailyVolume.add(token(log.collateralIndex), log.positionSizeCollateral);
  });

  const addTradingFees = (logs: any[], destination: any, label: string) => {
    logs.forEach((log: any) => {
      dailyFees.add(token(log.collateralIndex), log.amountCollateral, LABELS.TradingFees);
      destination.add(token(log.collateralIndex), log.amountCollateral, label);
    });
  };
  addTradingFees(gov, dailyRevenue, LABELS.TradingFeesToProtocol);
  addTradingFees(gnsOtc, dailyRevenue, LABELS.TradingFeesToProtocol);
  addTradingFees(gToken, dailySupplySideRevenue, LABELS.TradingFeesToPool);
  addTradingFees(gTokenOc, dailySupplySideRevenue, LABELS.TradingFeesToPool);
  addTradingFees(referral, dailySupplySideRevenue, LABELS.TradingFeesToPool);
  addTradingFees(trigger, dailySupplySideRevenue, LABELS.TradingFeesToPool);

  holding.forEach((log: any) => {
    const fees = log.tradeHoldingFees;
    const borrowingFee = BigInt(fees.borrowingFeeCollateral) + BigInt(fees.borrowingFeeCollateral_old);
    if (borrowingFee === 0n) return;
    dailyFees.add(token(log.collateralIndex), borrowingFee, LABELS.BorrowingFees);
    dailySupplySideRevenue.add(token(log.collateralIndex), borrowingFee, LABELS.BorrowingFeesToPool);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Notional (collateral x leverage) of every opening and closing trade on Nova's markets, partial size changes included, read from the trading diamond's FeesProcessed events. Liquidations are excluded.",
  Fees: "All fees traders pay, before any share goes back to Conviction Pool depositors or referrers: opening and closing fees, liquidation closing fees included, plus the borrowing fees paid while a position is open. Funding is paid between traders and is not counted.",
  UserFees: "All fees are paid by traders.",
  Revenue: "The share of opening and closing fees Nova keeps (governance fee).",
  ProtocolRevenue: "The share of opening and closing fees Nova keeps (governance fee). Nova has no token.",
  SupplySideRevenue:
    "The share of opening and closing fees sent to the Conviction Pool (vault, OC, referral and trigger shares) and all borrowing fees.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.TradingFees]: "Opening and closing fees charged on position notional, liquidation closing fees included.",
    [LABELS.BorrowingFees]: "Borrowing fees charged on open positions.",
  },
  UserFees: {
    [LABELS.TradingFees]: "Opening and closing fees charged on position notional, liquidation closing fees included.",
    [LABELS.BorrowingFees]: "Borrowing fees charged on open positions.",
  },
  Revenue: {
    [LABELS.TradingFeesToProtocol]: "Governance share of opening and closing fees, collected by Nova.",
  },
  ProtocolRevenue: {
    [LABELS.TradingFeesToProtocol]: "Governance share of opening and closing fees, collected by Nova.",
  },
  SupplySideRevenue: {
    [LABELS.TradingFeesToPool]: "Share of opening and closing fees sent to the Conviction Pool depositors.",
    [LABELS.BorrowingFeesToPool]: "Borrowing fees, all sent to the Conviction Pool depositors.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2026-09-30",
  methodology,
  breakdownMethodology,
};

export default adapter;
