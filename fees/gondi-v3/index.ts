import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Gondi V3 — NFT lending protocol
// Docs:      https://docs.gondi.xyz/
// Fees:      https://docs.gondi.xyz/gondi-v3/protocol-fees#lender-fees
// Contracts: https://docs.gondi.xyz/gondi-v3/protocol-contracts
const config: Record<string, { targets: string[]; start: string; fromBlock: number }> = {
  [CHAIN.ETHEREUM]: {
    targets: [
      "0xf65b99ce6dc5f6c556172bcc0ff27d3665a7d9a8", // V3.0
      "0xf41B389E0C1950dc0B16C9498eaE77131CC08A56", // V3.1
    ],
    start: "2024-09-02",
    fromBlock: 20663554,
  },
  [CHAIN.HYPERLIQUID]: {
    targets: [
      "0x6ad675624ec8320e5806858cd5db101a0b927fd9", // V3.1
    ],
    start: "2026-03-18",
    fromBlock: 30081557,
  },
};

const BPS_DIVISOR = 10000n;

// LoanEmitted/LoanRefinanced/LoanRefinancedFromNewOffers: fee/totalFee = total fee paid
// LoanRepaid: fee = protocol's cut (totalProtocolFee in contract source)
const events = {
  LoanEmitted: "event LoanEmitted(uint256 loanId, uint256[] offerId, (address borrower, uint256 nftCollateralTokenId, address nftCollateralAddress, address principalAddress, uint256 principalAmount, uint256 startTime, uint256 duration, (uint256 loanId, uint256 floor, uint256 principalAmount, address lender, uint256 accruedInterest, uint256 startTime, uint256 aprBps)[] tranche, uint256 protocolFee) loan, uint256 fee)",
  LoanRepaid: "event LoanRepaid(uint256 loanId, uint256 totalRepayment, uint256 fee)",
  LoanRefinanced: "event LoanRefinanced(uint256 renegotiationId, uint256 oldLoanId, uint256 newLoanId, (address borrower, uint256 nftCollateralTokenId, address nftCollateralAddress, address principalAddress, uint256 principalAmount, uint256 startTime, uint256 duration, (uint256 loanId, uint256 floor, uint256 principalAmount, address lender, uint256 accruedInterest, uint256 startTime, uint256 aprBps)[] tranche, uint256 protocolFee) loan, uint256 fee)",
  LoanRefinancedFromNewOffers: "event LoanRefinancedFromNewOffers(uint256 loanId, uint256 newLoanId, (address borrower, uint256 nftCollateralTokenId, address nftCollateralAddress, address principalAddress, uint256 principalAmount, uint256 startTime, uint256 duration, (uint256 loanId, uint256 floor, uint256 principalAmount, address lender, uint256 accruedInterest, uint256 startTime, uint256 aprBps)[] tranche, uint256 protocolFee) loan, uint256[] offerIds, uint256 totalFee)",
};

// Protocol revenue = fee * protocolFeeBps / 10000
function getProtocolFee(fee: bigint, feeBps: bigint): bigint {
  return fee * feeBps / BPS_DIVISOR;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { targets, fromBlock } = config[options.chain];

  const [emittedAll, refinancedAll, refinancedNewAll, repaidDaily] = await Promise.all([
    options.getLogs({ targets, eventAbi: events.LoanEmitted, fromBlock, cacheInCloud: true, entireLog: true, parseLog: true }),
    options.getLogs({ targets, eventAbi: events.LoanRefinanced, fromBlock, cacheInCloud: true, entireLog: true, parseLog: true }),
    options.getLogs({ targets, eventAbi: events.LoanRefinancedFromNewOffers, fromBlock, cacheInCloud: true, entireLog: true, parseLog: true }),
    options.getLogs({ targets, eventAbi: events.LoanRepaid, entireLog: true, parseLog: true }),
  ]);

  // Build loanId -> {token, feeBps}
  const loanInfo: Record<string, { token: string; feeBps: bigint, timestamp: string }> = {};
  for (const entireLog of emittedAll) {
    const log = entireLog.args
    loanInfo[log.loanId.toString()] = { token: log.loan.principalAddress, feeBps: BigInt(log.loan.protocolFee), timestamp: entireLog.timestamp };
  }
  for (const entireLog of refinancedAll) {
    const log = entireLog.args
    if(!loanInfo[log.newLoanId.toString()] || entireLog.timestamp > loanInfo[log.newLoanId.toString()].timestamp)
    loanInfo[log.newLoanId.toString()] = { token: log.loan.principalAddress, feeBps: BigInt(log.loan.protocolFee), timestamp: entireLog.timestamp };
  }
  for (const entireLog of refinancedNewAll) {
    const log = entireLog.args
    if(!loanInfo[log.newLoanId.toString()] || entireLog.timestamp > loanInfo[log.newLoanId.toString()].timestamp)
    loanInfo[log.newLoanId.toString()] = { token: log.loan.principalAddress, feeBps: BigInt(log.loan.protocolFee), timestamp: entireLog.timestamp };
  }

  const isInTimeRange = (ts: bigint) => ts >= options.startTimestamp && ts < options.endTimestamp;

  // Daily origination fees (LoanEmitted)
  for (const entireLog of emittedAll) {
    const log = entireLog.args
    if (!isInTimeRange(BigInt(log.loan.startTime))) continue;
    const feeBps = BigInt(log.loan.protocolFee);
    const token = log.loan.principalAddress;
    const fee = BigInt(log.fee);
    const protocolCut = getProtocolFee(fee, feeBps);
    dailyFees.add(token, fee, 'Loan origination fees');
    dailyRevenue.add(token, protocolCut, 'Loan origination fees to protocol');
    dailySupplySideRevenue.add(token, fee - protocolCut, 'Loan origination fees to lenders');
  }

  // Daily repayment fees (LoanRepaid)
  for (const entireLog of repaidDaily) {
    const log = entireLog.args
    const info = loanInfo[log.loanId.toString()];
    if (!info || info.feeBps === 0n) continue;
    const protocolCut = BigInt(log.fee);
    const totalInterest = protocolCut * BPS_DIVISOR / info.feeBps;
    dailyFees.add(info.token, totalInterest, 'Loan repayment fees');
    dailyRevenue.add(info.token, protocolCut, 'Loan repayment fees to protocol');
    dailySupplySideRevenue.add(info.token, totalInterest - protocolCut, 'Loan repayment fees to lenders');
  }

  // Daily refinancing fees (LoanRefinanced)
  for (const entireLog of refinancedAll) {
    const log = entireLog.args
    if (!isInTimeRange(BigInt(log.loan.startTime))) continue;
    const feeBps = BigInt(log.loan.protocolFee);
    const token = log.loan.principalAddress;
    const fee = BigInt(log.fee);
    const protocolCut = getProtocolFee(fee, feeBps);
    dailyFees.add(token, fee, 'Loan refinancing fees');
    dailyRevenue.add(token, protocolCut, 'Loan refinancing fees to protocol');
    dailySupplySideRevenue.add(token, fee - protocolCut, 'Loan refinancing fees to lenders');
  }

  // Daily refinancing fees from new offers
  for (const entireLog of refinancedNewAll) {
    const log = entireLog.args
    if (!isInTimeRange(BigInt(log.loan.startTime))) continue;
    const feeBps = BigInt(log.loan.protocolFee);
    const token = log.loan.principalAddress;
    const fee = BigInt(log.totalFee);
    const protocolCut = getProtocolFee(fee, feeBps);
    dailyFees.add(token, fee, 'Loan refinancing fees from new offers');
    dailyRevenue.add(token, protocolCut, 'Loan refinancing fees from new offers to protocol');
    dailySupplySideRevenue.add(token, fee - protocolCut, 'Loan refinancing fees from new offers to lenders');
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total interest and origination/refinancing fees paid by borrowers and lenders on Gondi V3 NFT lending.",
  Revenue: "15% of realized interest + 15% of origination/refinancing fees.",
  ProtocolRevenue: "15% of realized interest + 15% of origination/refinancing fees.",
  SupplySideRevenue: "85% of interest and origination/refinancing fees distributed to lenders.",
};

const breakdownMethodology = {
  Fees: {
    'Loan origination fees': 'Origination fees paid by borrowers on loan origination.',
    'Loan repayment fees': 'Repayment fees paid by borrowers on loan repayment.',
    'Loan refinancing fees': 'Refinancing fees paid by borrowers on loan refinancing.',
    'Loan refinancing fees from new offers': 'Refinancing fees paid by borrowers on loan refinancing from new offers.',
  },
  Revenue: {
    'Loan origination fees to protocol': '15% protocol fee on realized interest and origination fees.',
    'Loan repayment fees to protocol': '15% protocol fee on realized interest and repayment fees.',
    'Loan refinancing fees to protocol': '15% protocol fee on realized interest and refinancing fees.',
    'Loan refinancing fees from new offers to protocol': '15% protocol fee on realized interest and refinancing fees from new offers.',
  },
  ProtocolRevenue: {
    'Loan origination fees to protocol': '15% protocol fee on realized interest and origination fees.',
    'Loan repayment fees to protocol': '15% protocol fee on realized interest and repayment fees.',
    'Loan refinancing fees to protocol': '15% protocol fee on realized interest and refinancing fees.',
    'Loan refinancing fees from new offers to protocol': '15% protocol fee on realized interest and refinancing fees from new offers.',
  },
  SupplySideRevenue: {
    'Loan origination fees to lenders': '85% of origination fees distributed to lenders.',
    'Loan repayment fees to lenders': '85% of repayment fees distributed to lenders.',
    'Loan refinancing fees to lenders': '85% of refinancing fees distributed to lenders.',
    'Loan refinancing fees from new offers to lenders': '85% of refinancing fees from new offers distributed to lenders.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: config,
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
