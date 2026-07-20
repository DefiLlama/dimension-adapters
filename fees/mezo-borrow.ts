import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, nullAddress } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

/**
 * Mezo Borrow — a Liquity-style CDP where users lock BTC (Mezo's native gas
 * token) to mint MUSD, Mezo's Bitcoin-backed stablecoin.
 * Docs: https://mezo.org/docs/users/borrow/
 *
 * Fees paid by borrowers:
 *  - Borrowing (issuance) fee, one-time, in MUSD  -> minted to PCV
 *  - Refinancing fee (a % of the borrowing fee), in MUSD -> minted to PCV
 *  - Ongoing interest (1% APR), in MUSD -> minted to PCV
 *  - Redemption fee, in BTC collateral -> sent to PCV
 *  - Liquidation gas compensation (BTC + MUSD) -> paid to the liquidator
 *  - On liquidation, Stability Pool depositors absorb the debt and receive the
 *    liquidated BTC collateral; their net gain (collateral - MUSD burned) is
 *    supply-side revenue.
 *
 * All MUSD fees (borrow + refinancing + interest) are minted to the PCV
 * (Protocol Controlled Value) treasury, so we read total MUSD minted to the PCV
 * and back out interest = total - borrowing/refinancing fees (from events).
 */

const MUSD = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186";

const CONTRACTS = {
  troveManager: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193",
  borrowerOperations: "0x44b1bac67dDA612a41a58AAf779143B181dEe031",
  stabilityPool: "0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32",
  pcv: "0x391EcC7ffEFc48cff41D0F2Bb36e38b82180B993",
};

const METRICS = {
  BorrowFees: "Borrow Fees",
  RedemptionFees: "Redemption Fees",
  GasCompensation: "Gas Compensation",
  LiquidationProfit: "Liquidation Profit",
};

const events = {
  borrowingFeePaid: "event BorrowingFeePaid(address indexed _borrower, uint256 _fee)",
  refinancingFeePaid: "event RefinancingFeePaid(address indexed _borrower, uint256 _fee)",
  redemption: "event Redemption(uint256 _attemptedAmount, uint256 _actualAmount, uint256 _collateralSent, uint256 _collateralFee)",
  liquidation: "event Liquidation(uint256 _liquidatedPrincipal, uint256 _liquidatedInterest, uint256 _liquidatedColl, uint256 _collGasCompensation, uint256 _gasCompensation)",
  collateralGainWithdrawn: "event CollateralGainWithdrawn(address indexed _depositor, uint256 _collateral, uint256 _MUSDLoss)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Borrowing + refinancing fees (MUSD), both minted to the PCV
  const borrowFeeLogs = await options.getLogs({ target: CONTRACTS.borrowerOperations, eventAbi: events.borrowingFeePaid });
  const refinanceFeeLogs = await options.getLogs({ target: CONTRACTS.borrowerOperations, eventAbi: events.refinancingFeePaid });

  const borrowFees = options.createBalances();
  borrowFeeLogs.forEach((log: any) => borrowFees.add(MUSD, log._fee));
  refinanceFeeLogs.forEach((log: any) => borrowFees.add(MUSD, log._fee));

  // Interest (MUSD): total MUSD minted to the PCV minus borrowing/refinancing fees 
  const musdToPCV = await addTokensReceived({ options, target: CONTRACTS.pcv, tokens: [MUSD], fromAdddesses: [nullAddress] });
  const interest = musdToPCV.clone();
  interest.subtract(borrowFees);

  dailyFees.addBalances(borrowFees, METRICS.BorrowFees);
  dailyFees.addBalances(interest, METRIC.BORROW_INTEREST);
  dailyRevenue.addBalances(borrowFees, METRICS.BorrowFees);
  dailyRevenue.addBalances(interest, METRIC.BORROW_INTEREST);

  // Redemption fees (BTC collateral), sent to the PCV 
  const redemptionLogs = await options.getLogs({ target: CONTRACTS.troveManager, eventAbi: events.redemption });
  redemptionLogs.forEach((log: any) => {
    dailyFees.addGasToken(log._collateralFee, METRICS.RedemptionFees);
    dailyRevenue.addGasToken(log._collateralFee, METRICS.RedemptionFees);
  });

  // Liquidation gas compensation (BTC + MUSD), paid to liquidators
  const liquidationLogs = await options.getLogs({ target: CONTRACTS.troveManager, eventAbi: events.liquidation });
  liquidationLogs.forEach((log: any) => {
    dailyFees.addGasToken(log._collGasCompensation, METRICS.GasCompensation);
    dailyFees.add(MUSD, log._gasCompensation, METRICS.GasCompensation);
    dailySupplySideRevenue.addGasToken(log._collGasCompensation, METRICS.GasCompensation);
    dailySupplySideRevenue.add(MUSD, log._gasCompensation, METRICS.GasCompensation);
  });

  // Liquidation profit to Stability Pool depositors
  // depositors receive liquidated BTC collateral and burn their MUSD deposit;
  // net gain (collateral - MUSD burned)
  const spGainLogs = await options.getLogs({ target: CONTRACTS.stabilityPool, eventAbi: events.collateralGainWithdrawn });
  spGainLogs.forEach((log: any) => {
    dailyFees.addGasToken(log._collateral, METRICS.LiquidationProfit);
    dailyFees.add(MUSD, BigInt(log._MUSDLoss) * -1n, METRICS.LiquidationProfit);
    dailySupplySideRevenue.addGasToken(log._collateral, METRICS.LiquidationProfit);
    dailySupplySideRevenue.add(MUSD, BigInt(log._MUSDLoss) * -1n, METRICS.LiquidationProfit);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Borrowing (0.1%) and refinancing (0.1%) fees plus interest (1-5% APR) paid in MUSD, redemption fees (0.75%) paid in BTC, liquidation gas compensation, and the net collateral gain absorbed by Stability Pool depositors.",
  Revenue: "Borrowing fees, refinancing fees, interest and redemption fees collected by the Mezo PCV treasury (later distributed via a governable split between repaying the protocol bootstrap loan and the MUSD Savings Vault).",
  ProtocolRevenue: "All borrowing fees, refinancing fees, interest and redemption fees accrue to the protocol-controlled Mezo PCV treasury.",
  SupplySideRevenue: "Liquidation gas compensation paid to liquidators and net liquidation profit distributed to Stability Pool depositors.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.BorrowFees]: "One-time borrowing (issuance) fees and refinancing fees paid by borrowers in MUSD.",
    [METRIC.BORROW_INTEREST]: "Ongoing interest paid by borrowers on their MUSD debt.",
    [METRICS.RedemptionFees]: "Redemption fees paid by borrowers in BTC collateral.",
    [METRICS.GasCompensation]: "Gas compensation paid to liquidators when triggering liquidations.",
    [METRICS.LiquidationProfit]: "Net BTC collateral gain (minus MUSD burned) absorbed by Stability Pool depositors on liquidations.",
  },
  Revenue: {
    [METRICS.BorrowFees]: "One-time borrowing and refinancing fees minted to the PCV treasury.",
    [METRIC.BORROW_INTEREST]: "Interest on MUSD debt minted to the PCV treasury.",
    [METRICS.RedemptionFees]: "Redemption fees sent to the PCV treasury.",
  },
  ProtocolRevenue: {
    [METRICS.BorrowFees]: "One-time borrowing and refinancing fees minted to the PCV treasury.",
    [METRIC.BORROW_INTEREST]: "Interest on MUSD debt minted to the PCV treasury.",
    [METRICS.RedemptionFees]: "Redemption fees sent to the PCV treasury.",
  },
  SupplySideRevenue: {
    [METRICS.GasCompensation]: "Gas compensation paid to liquidators when triggering liquidations.",
    [METRICS.LiquidationProfit]: "Net BTC collateral gain (minus MUSD burned) distributed to Stability Pool depositors.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEZO]: {
      fetch,
      start: "2025-05-13",
    },
  },
  methodology,
  breakdownMethodology,
  pullHourly: true,
};

export default adapter;
