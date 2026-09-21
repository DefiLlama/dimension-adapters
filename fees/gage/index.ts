// DefiLlama fees adapter for gage (dimension-adapters: fees/gage/index.ts). Upstream copy of this file.
// Every address comes from ./universe.json, generated from the live deployment manifest by
// `node scripts/defillama-universe.mjs` in github.com/DebenLabs/gagedotcash (docs/TVL-REPORTING.md §3).
//
// What users pay on gage, by source:
//  - the deal fee (legacy vaults, 1% of funded principal) and the origination fee (V2 engines, registry feeBps):
//    protocol revenue, all of it spent on GAGE for the permanent floor bands since D57 → holders revenue;
//  - trade fees on sold reclaim rights and lender units, and the cash-out platform fee: the same route;
//  - the borrower's fixed cost, paid to the lender at repayment (cap minus principal): supply-side revenue;
//  - the Earn performance fee, taken from a lender return already counted above: protocol revenue, not added
//    to fees again (supply-side revenue is therefore the gross lender return).
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import U from "./universe.json";

const REPAID = 3;
const isReceipt = (token: string) => U.excludedTokens.includes(token.toLowerCase());

const EVENTS = {
  funded: "event Funded(uint256 indexed dealId, uint256 indexed bidId, address indexed lender, uint128 price, uint128 fee, uint40 fundedAt, uint40 expiry)",
  reclaimed: "event Reclaimed(uint256 indexed dealId)",
  activated: "event Activated(uint256 indexed id, uint40 fundedAt, uint128 fee, uint128 borrowerReward, uint128 lenderReward)",
  closed: "event Closed(uint256 indexed id, uint8 state, address beneficiary, uint40 closedAt)",
  rightSold: "event RightSold(uint256 indexed id, address indexed seller, address indexed buyer, address recipient, uint128 price, uint256 fee, uint256 nonce)",
  lenderSold: "event LenderSold(uint256 indexed id, address indexed seller, address indexed buyer, address recipient, uint8 slots, uint128 price, uint256 fee, uint256 nonce)",
  cashedOut: "event CashedOut(uint256 indexed loanId, address indexed owner, address indexed recipient, uint256 gross, uint256 cap, uint256 financeFee, uint256 platformFee, uint256 net)",
  profitReported: "event ProfitReported(uint256 indexed loanId, uint256 profit, uint256 fee)",
};
const DEAL_ABI = "function getDeal(uint256) view returns ((address borrower, uint8 kind, uint8 state, uint32 term, uint40 listingExpiry, address token, uint40 fundedAt, uint40 expiry, uint256 amountOrTokenId, uint128 cap, uint128 minPrice, address lender, uint128 price, uint128 fee))";
const LOAN_ABI = "function getLoan(uint256) view returns ((address originator, address account, address token, address collateralBeneficiary, uint8 kind, uint8 state, uint8 filled, uint32 term, uint40 fundingDeadline, uint40 fundedAt, uint40 closedAt, uint128 principal, uint128 cap, uint128 originationFee, uint128 borrowerReward, uint128 lenderReward, uint256 collateral, bytes32 exposureKey, uint256 exposureAmount))";

const LABEL = {
  DEAL_FEE: "Deal and origination fees",
  TRADE_FEE: "Trade and cash-out fees",
  LOAN_COST: "Borrower cost paid to lenders",
  EARN_FEE: "Earn performance fee",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const usdg = U.usdg;
  const logs = (target: string, eventAbi: string) => options.getLogs({ target, eventAbi });

  for (const vault of U.vaults) {
    for (const log of await logs(vault.address, EVENTS.funded)) {
      dailyFees.add(usdg, log.fee, LABEL.DEAL_FEE);
      dailyRevenue.add(usdg, log.fee, LABEL.DEAL_FEE);
      dailyHoldersRevenue.add(usdg, log.fee, LABEL.DEAL_FEE);
    }
    const reclaimed = await logs(vault.address, EVENTS.reclaimed);
    if (reclaimed.length) {
      // Cap and price are fixed at funding, so the end-of-window read is the same as the reclaim-block read.
      const deals = await options.toApi.multiCall({ target: vault.address, abi: DEAL_ABI, calls: reclaimed.map((log: any) => log.dealId.toString()) });
      for (const d of deals) {
        if (isReceipt(d.token)) continue; // The engine's loan reports its own cost.
        const cost = BigInt(d.cap) - BigInt(d.price);
        if (cost > 0n) { dailyFees.add(usdg, cost, LABEL.LOAN_COST); dailySupplySideRevenue.add(usdg, cost, LABEL.LOAN_COST); }
      }
    }
  }

  for (const engine of U.engines) {
    for (const log of await logs(engine.engine, EVENTS.activated)) {
      dailyFees.add(usdg, log.fee, LABEL.DEAL_FEE);
      dailyRevenue.add(usdg, log.fee, LABEL.DEAL_FEE);
      dailyHoldersRevenue.add(usdg, log.fee, LABEL.DEAL_FEE);
    }
    for (const log of [...(await logs(engine.engine, EVENTS.rightSold)), ...(await logs(engine.engine, EVENTS.lenderSold))]) {
      dailyFees.add(usdg, log.fee, LABEL.TRADE_FEE);
      dailyRevenue.add(usdg, log.fee, LABEL.TRADE_FEE);
      dailyHoldersRevenue.add(usdg, log.fee, LABEL.TRADE_FEE);
    }
    const repaid = (await logs(engine.engine, EVENTS.closed)).filter((log: any) => Number(log.state) === REPAID);
    if (repaid.length) {
      const loans = await options.toApi.multiCall({ target: engine.engine, abi: LOAN_ABI, calls: repaid.map((log: any) => log.id.toString()) });
      for (const l of loans) {
        const cost = BigInt(l.cap) - BigInt(l.principal);
        if (cost > 0n) { dailyFees.add(usdg, cost, LABEL.LOAN_COST); dailySupplySideRevenue.add(usdg, cost, LABEL.LOAN_COST); }
      }
    }
    if (engine.cashoutRouter) {
      for (const log of await logs(engine.cashoutRouter, EVENTS.cashedOut)) {
        dailyFees.add(usdg, log.platformFee, LABEL.TRADE_FEE);
        dailyRevenue.add(usdg, log.platformFee, LABEL.TRADE_FEE);
        dailyHoldersRevenue.add(usdg, log.platformFee, LABEL.TRADE_FEE);
      }
    }
  }

  for (const strategy of U.earn) {
    for (const log of await logs(strategy.vault, EVENTS.profitReported)) {
      dailyRevenue.add(usdg, log.fee, LABEL.EARN_FEE);
      dailyProtocolRevenue.add(usdg, log.fee, LABEL.EARN_FEE);
    }
  }

  return { dailyFees, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: U.start,
  methodology: {
    Fees: "Everything borrowers and traders pay on gage: the deal or origination fee taken when a loan funds, trade fees on sold reclaim rights and lender units, the cash-out platform fee, and the borrower's fixed cost paid to lenders at repayment (repayment cap minus principal). Fixed-cost loans have no interest accrual: the cost is booked when the loan is repaid.",
    Revenue: "Deal, origination, trade and cash-out fees, plus the Earn performance fee on lender returns.",
    HoldersRevenue: "Deal, origination, trade and cash-out fees: since D57 every one of them buys GAGE for the permanent GAGE-only floor bands of the GAGE/sGAGE pool.",
    ProtocolRevenue: "The Earn performance fee (curator and protocol shares).",
    SupplySideRevenue: "The borrower's fixed cost paid to lenders at repayment, before the Earn performance fee for loans an Earn strategy funded.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL.DEAL_FEE]: "1% of funded principal on legacy vaults; the registry feeBps of principal on V2 engines, charged at activation.",
      [LABEL.TRADE_FEE]: "The registry trade fee on a sold reclaim right or lender unit; 0.5% of remaining proceeds on a cash-out.",
      [LABEL.LOAN_COST]: "Repayment cap minus funded principal, paid to the lender when the borrower reclaims.",
    },
    Revenue: {
      [LABEL.DEAL_FEE]: "Routed to the GAGE floor through DealFeeRouter.",
      [LABEL.TRADE_FEE]: "Routed to the GAGE floor through DealFeeRouter.",
      [LABEL.EARN_FEE]: "feeBps of a settled loan's return; the protocol share goes to the deal fee router, the rest to the curator.",
    },
  },
};

export default adapter;
