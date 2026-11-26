import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";

// https://github.com/SmarDex-Ecosystem/spro-contracts/blob/main/broadcast/Spro.s.sol/1/run-1747308925.json
const SPRO = "0x969b2b809921136fd5b99a81d9666b2afe337084";
const SPRO_DEPLOY_BLOCK = 22488253;
const SDEX = "0x5de8ab7e27f6e7a1fff3e5b337584aa43961beef";

const PROPOSAL_CREATED = "event ProposalCreated(bytes32 proposalHash, (address collateralAddress, uint256 collateralAmount, address creditAddress, uint256 availableCreditLimit, uint256 fixedInterestAmount, uint40 startTimestamp, uint40 loanExpiration, address proposer, uint256 nonce, uint256 minAmount) proposal, uint256 sdexBurned)";
const LOAN_CREATED = "event LoanCreated(uint256 loanId, bytes32 indexed proposalHash, (address lender, address borrower, uint40 startTimestamp, uint40 loanExpiration, address collateralAddress, uint256 collateralAmount, address creditAddress, uint256 creditAmount, uint256 fixedInterestAmount) loanTerms)";
const LOAN_PAID_BACK = "event LoanPaidBack(uint256 loanId)";

const PROPOSAL_FEES = "Proposal Fees";
const PROPOSAL_FEES_BURNED = "Proposal Fees Burned";
const BORROW_INTEREST_TO_LENDERS = "Borrow Interest To Lenders";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const proposals = await options.getLogs({ target: SPRO, eventAbi: PROPOSAL_CREATED });
  for (const { sdexBurned } of proposals) {
    dailyFees.add(SDEX, sdexBurned, PROPOSAL_FEES);
    dailyRevenue.add(SDEX, sdexBurned, PROPOSAL_FEES_BURNED);
  }

  const loans = await options.getLogs({ target: SPRO, eventAbi: LOAN_CREATED, fromBlock: SPRO_DEPLOY_BLOCK, cacheInCloud: true });
  const termsByLoanId: Record<string, any> = {};
  for (const { loanId, loanTerms } of loans) termsByLoanId[loanId] = loanTerms;

  const repayments = await options.getLogs({ target: SPRO, eventAbi: LOAN_PAID_BACK });
  for (const { loanId } of repayments) {
    const { creditAddress, fixedInterestAmount } = termsByLoanId[loanId];
    dailyFees.add(creditAddress, fixedInterestAmount, METRIC.BORROW_INTEREST);
    dailySupplySideRevenue.add(creditAddress, fixedInterestAmount, BORROW_INTEREST_TO_LENDERS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue.clone(),
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-05-22",
  methodology: {
    Fees: "Interest paid by borrowers to lenders when loans are repaid, plus the SDEX fee borrowers pay each time they create a loan proposal.",
    Revenue: "The SDEX fee paid on each new loan proposal, all of which is burned.",
    SupplySideRevenue: "Interest paid by borrowers on repaid loans, all of which goes to the lenders.",
    HoldersRevenue: "The SDEX fee paid on each new loan proposal, which is burned and removed from the SDEX supply.",
    ProtocolRevenue: "The protocol treasury receives nothing: proposal fees are burned and interest goes to lenders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Fixed interest paid by borrowers when they repay a loan.",
      [PROPOSAL_FEES]: "SDEX fee paid by borrowers each time they create a loan proposal.",
    },
    Revenue: {
      [PROPOSAL_FEES_BURNED]: "SDEX fee paid on each new loan proposal, sent to the burn address.",
    },
    SupplySideRevenue: {
      [BORROW_INTEREST_TO_LENDERS]: "Fixed interest on repaid loans, paid to the lenders.",
    },
    HoldersRevenue: {
      [PROPOSAL_FEES_BURNED]: "SDEX fee paid on each new loan proposal, sent to the burn address.",
    },
  },
};

export default adapter;
