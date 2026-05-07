import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Gondi V3 — NFT lending protocol
// Docs:      https://docs.gondi.xyz/
// Fees:      https://docs.gondi.xyz/gondi-v3/protocol-fees#lender-fees
// Contracts: https://docs.gondi.xyz/gondi-v3/protocol-contracts
const config: Record<string, { targets: string[]; fromBlock: number }> = {
  [CHAIN.ETHEREUM]: {
    targets: [
      "0xf65b99ce6dc5f6c556172bcc0ff27d3665a7d9a8", // V3.0
      "0xf41B389E0C1950dc0B16C9498eaE77131CC08A56", // V3.1
    ],
    fromBlock: 20663554,
  },
  [CHAIN.HYPERLIQUID]: {
    targets: [
      "0x6ad675624ec8320e5806858cd5db101a0b927fd9", // V3.1
    ],
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
  const startTime = BigInt(options.startTimestamp);
  const endTime = BigInt(options.endTimestamp);

  const [emittedAll, refinancedAll, refinancedNewAll, repaidDaily] = await Promise.all([
    options.getLogs({ targets, eventAbi: events.LoanEmitted, fromBlock, cacheInCloud: true }),
    options.getLogs({ targets, eventAbi: events.LoanRefinanced, fromBlock, cacheInCloud: true }),
    options.getLogs({ targets, eventAbi: events.LoanRefinancedFromNewOffers, fromBlock, cacheInCloud: true }),
    options.getLogs({ targets, eventAbi: events.LoanRepaid }),
  ]);

  // Build loanId -> {token, feeBps}
  const loanInfo: Record<string, { token: string; feeBps: bigint }> = {};
  for (const log of emittedAll) {
    loanInfo[log.loanId.toString()] = { token: log.loan.principalAddress, feeBps: BigInt(log.loan.protocolFee) };
  }
  for (const log of refinancedAll) {
    loanInfo[log.newLoanId.toString()] = { token: log.loan.principalAddress, feeBps: BigInt(log.loan.protocolFee) };
  }
  for (const log of refinancedNewAll) {
    loanInfo[log.newLoanId.toString()] = { token: log.loan.principalAddress, feeBps: BigInt(log.loan.protocolFee) };
  }

  const isInDailyRange = (ts: bigint) => ts >= startTime && ts < endTime;

  // Daily origination fees (LoanEmitted)
  for (const log of emittedAll) {
    if (!isInDailyRange(BigInt(log.loan.startTime))) continue;
    const feeBps = BigInt(log.loan.protocolFee);
    if (feeBps === 0n) continue;
    const token = log.loan.principalAddress;
    const fee = BigInt(log.fee);
    const protocolCut = getProtocolFee(fee, feeBps);
    dailyFees.add(token, fee, METRIC.SERVICE_FEES);
    dailyRevenue.add(token, protocolCut, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(token, fee - protocolCut, METRIC.SERVICE_FEES);
  }

  // Daily repayment fees (LoanRepaid)
  for (const log of repaidDaily) {
    const info = loanInfo[log.loanId.toString()];
    if (!info || info.feeBps === 0n) continue;
    const protocolCut = BigInt(log.fee);
    const totalInterest = protocolCut * BPS_DIVISOR / info.feeBps;
    dailyFees.add(info.token, totalInterest, METRIC.BORROW_INTEREST);
    dailyRevenue.add(info.token, protocolCut, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(info.token, totalInterest - protocolCut, METRIC.BORROW_INTEREST);
  }

  // Daily refinancing fees (LoanRefinanced)
  for (const log of refinancedAll) {
    if (!isInDailyRange(BigInt(log.loan.startTime))) continue;
    const feeBps = BigInt(log.loan.protocolFee);
    if (feeBps === 0n) continue;
    const token = log.loan.principalAddress;
    const fee = BigInt(log.fee);
    const protocolCut = getProtocolFee(fee, feeBps);
    dailyFees.add(token, fee, METRIC.SERVICE_FEES);
    dailyRevenue.add(token, protocolCut, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(token, fee - protocolCut, METRIC.SERVICE_FEES);
  }

  // Daily refinancing fees from new offers
  for (const log of refinancedNewAll) {
    if (!isInDailyRange(BigInt(log.loan.startTime))) continue;
    const feeBps = BigInt(log.loan.protocolFee);
    if (feeBps === 0n) continue;
    const token = log.loan.principalAddress;
    const fee = BigInt(log.totalFee);
    const protocolCut = getProtocolFee(fee, feeBps);
    dailyFees.add(token, fee, METRIC.SERVICE_FEES);
    dailyRevenue.add(token, protocolCut, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(token, fee - protocolCut, METRIC.SERVICE_FEES);
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

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers on loan repayments.',
      [METRIC.SERVICE_FEES]: 'Origination and refinancing fees charged on new loans.',
      [METRIC.PROTOCOL_FEES]: '15% protocol fee on realized interest and origination fees.',
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: '15% of realized interest and origination/refinancing fees.',
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: '15% of realized interest and origination/refinancing fees.',
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: '85% of interest distributed to lenders.',
      [METRIC.SERVICE_FEES]: '85% of origination/refinancing fees retained by lenders.',
    },
  },
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2024-09-02" },
    [CHAIN.HYPERLIQUID]: { start: "2025-03-18" },
  },
};

export default adapter;
