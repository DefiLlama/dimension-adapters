// DefiLlama fees adapter for gage (dimension-adapters: fees/gage/index.ts). Upstream copy of this file.
// Every address comes from ./universe.json, generated from the live deployment manifest by
// `node scripts/defillama-universe.mjs` in github.com/DebenLabs/gagedotcash (docs/TVL-REPORTING.md §3).
//
// What users pay on gage, by source:
//  - the deal fee (legacy vaults, 1% of funded principal) and the origination fee (V2 engines and Intent cores,
//    registry feeBps): protocol revenue, all of it spent on GAGE for the permanent floor bands since D57 → holders
//    revenue. A bridged engine mirrors each loan as a legacy deal whose collateral is the engine's receipt token; the
//    fee is charged once, so the engine's Activated event books it and the mirrored deal is skipped;
//  - trade fees on sold reclaim rights and lender units, and the cash-out platform fee: the same route;
//  - the borrower's fixed cost, paid to the lender at repayment (cap minus principal): supply-side revenue;
//  - the Earn performance fee, taken from a lender return already counted above: protocol revenue, not added
//    to fees again (supply-side revenue is therefore the gross lender return);
//  - Intent V1 (partner vaults): the execution fee each fill takes from the vaults' return and the protocol's 10% of a
//    partner vault's performance fee, both shares of a lender return already counted above and both spent on the
//    GAGE floor → revenue and holders revenue, not fees again. The manager keeps the other 90% of its fee;
//  - Intent lend-asset generations lend a stock token: their fees and costs are amounts of that token.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import U from "./universe.json";
import ADDRESSES from '../../helpers/coreAssets.json'

const REPAID = 3;
const PROTOCOL_SHARE_BPS = 1000n; // IntentFeeMath.PROTOCOL_SHARE_BPS: the protocol's part of a partner vault's fee.
const isReceipt = (token: string) => U.excludedTokens.includes(token.toLowerCase());

const EVENTS = {
  funded: "event Funded(uint256 indexed dealId, uint256 indexed bidId, address indexed lender, uint128 price, uint128 fee, uint40 fundedAt, uint40 expiry)",
  reclaimed: "event Reclaimed(uint256 indexed dealId)",
  activated: "event Activated(uint256 indexed id, uint40 fundedAt, uint128 fee, uint128 borrowerReward, uint128 lenderReward)",
  closed: "event Closed(uint256 indexed id, uint8 state, address beneficiary, uint40 closedAt)",
  rightSold: "event RightSold(uint256 indexed id, address indexed seller, address indexed buyer, address recipient, uint128 price, uint256 fee, uint256 nonce)",
  lenderSold: "event LenderSold(uint256 indexed id, address indexed seller, address indexed buyer, address recipient, uint8 slots, uint128 price, uint256 fee, uint256 nonce)",
  lenderSplitSold: "event LenderSplitSold(uint256 indexed id, address indexed seller, address indexed buyer, uint8 slots, uint128 price, uint256 fee, uint256 nonce, address[4] recipients)",
  cashedOut: "event CashedOut(uint256 indexed loanId, address indexed owner, address indexed recipient, uint256 gross, uint256 cap, uint256 financeFee, uint256 platformFee, uint256 net)",
  profitReported: "event ProfitReported(uint256 indexed loanId, uint256 profit, uint256 fee)",
  filled: "event Filled(bytes32 indexed digest, uint256 indexed listingId, address indexed filler, uint40 activatedAt, uint256 principal, uint256 executionFee, address protocolRecipient)",
  secondaryFilled: "event SecondaryFilled(bytes32 indexed digest, uint256 indexed loanId, address indexed filler, address seller, address market, uint8 slots, uint256 price, uint256 executionFee, address protocolRecipient)",
  staleFeesSwept: "event StaleFeesSwept(address indexed vault, address indexed protocolRecipient, uint256 amount)",
};
const DEAL_ABI = "function getDeal(uint256) view returns ((address borrower, uint8 kind, uint8 state, uint32 term, uint40 listingExpiry, address token, uint40 fundedAt, uint40 expiry, uint256 amountOrTokenId, uint128 cap, uint128 minPrice, address lender, uint128 price, uint128 fee))";
const LOAN_ABI = "function getLoan(uint256) view returns ((address originator, address account, address token, address collateralBeneficiary, uint8 kind, uint8 state, uint8 filled, uint32 term, uint40 fundingDeadline, uint40 fundedAt, uint40 closedAt, uint128 principal, uint128 cap, uint128 originationFee, uint128 borrowerReward, uint128 lenderReward, uint256 collateral, bytes32 exposureKey, uint256 exposureAmount))";

const LABEL = {
  DEAL_FEE: "Deal and origination fees",
  TRADE_FEE: "Trade and cash-out fees",
  LOAN_COST: "Borrower cost paid to lenders",
  EARN_FEE: "Earn performance fee",
  EXECUTION_FEE: "Intent execution fee",
  PARTNER_FEE: "Partner vault performance fee, protocol share",
};

const addFloorFee = (balances: { fees: any; revenue: any; holders: any }, token: string, amount: any, label: string) => {
  balances.fees.add(token, amount, label);
  balances.revenue.add(token, amount, label);
  balances.holders.add(token, amount, label);
};
// A share of a lender return already booked as fees: revenue for the GAGE floor, never a new fee.
const addFloorShare = (balances: { revenue: any; holders: any }, token: string, amount: any, label: string) => {
  balances.revenue.add(token, amount, label);
  balances.holders.add(token, amount, label);
};

/** Logs of `targets`, each paired with the asset of the target that emitted it. */
const logsByAsset = async (options: FetchOptions, targets: { address: string; asset: string }[], eventAbi: string) => {
  if (!targets.length) return [];
  const byTarget: any[][] = await options.getLogs({ targets: targets.map((t) => t.address), eventAbi, flatten: false });
  return byTarget.flatMap((logs, i) => logs.map((log) => ({ log, target: targets[i].address, asset: targets[i].asset })));
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const usdg = ADDRESSES.robinhood.USDG;
  const floor = { fees: dailyFees, revenue: dailyRevenue, holders: dailyHoldersRevenue };

  const vaults = U.vaults.map((vault) => ({ address: vault.address, asset: usdg }));
  const engines = U.engines.map((engine) => ({ address: engine.engine, asset: engine.asset }));
  const cashouts = U.engines.filter((engine) => engine.cashoutRouter).map((engine) => ({ address: engine.cashoutRouter, asset: engine.asset }));
  const earnVaults = U.earn.map((strategy) => strategy.vault);
  const fillRouters = U.intent.filter((g) => g.fillRouter).map((g) => ({ address: g.fillRouter, asset: g.asset }));

  // Legacy deals: one getDeal per funded or reclaimed deal, at the end of the window (cap, price and token are fixed
  // at funding). A deal whose collateral is an engine receipt is that engine's loan, booked below.
  const funded = await logsByAsset(options, vaults, EVENTS.funded);
  const reclaimed = await logsByAsset(options, vaults, EVENTS.reclaimed);
  const dealLogs = [...funded, ...reclaimed];
  const deals = dealLogs.length ? await options.toApi.multiCall({ abi: DEAL_ABI, calls: dealLogs.map(({ log, target }) => ({ target, params: log.dealId.toString() })) }) : [];
  funded.forEach(({ log }, i) => {
    if (!isReceipt(deals[i].token)) addFloorFee(floor, usdg, log.fee, LABEL.DEAL_FEE);
  });
  reclaimed.forEach((_, i) => {
    const d = deals[funded.length + i];
    if (isReceipt(d.token)) return;
    const cost = BigInt(d.cap) - BigInt(d.price);
    if (cost > 0n) { dailyFees.add(usdg, cost, LABEL.LOAN_COST); dailySupplySideRevenue.add(usdg, cost, LABEL.LOAN_COST); }
  });

  for (const { log, asset } of await logsByAsset(options, engines, EVENTS.activated)) addFloorFee(floor, asset, log.fee, LABEL.DEAL_FEE);
  for (const eventAbi of [EVENTS.rightSold, EVENTS.lenderSold, EVENTS.lenderSplitSold]) {
    for (const { log, asset } of await logsByAsset(options, engines, eventAbi)) addFloorFee(floor, asset, log.fee, LABEL.TRADE_FEE);
  }
  const repaid = (await logsByAsset(options, engines, EVENTS.closed)).filter(({ log }) => Number(log.state) === REPAID);
  if (repaid.length) {
    const loans = await options.toApi.multiCall({ abi: LOAN_ABI, calls: repaid.map(({ log, target }) => ({ target, params: log.id.toString() })) });
    loans.forEach((l: any, i: number) => {
      const cost = BigInt(l.cap) - BigInt(l.principal);
      if (cost > 0n) { dailyFees.add(repaid[i].asset, cost, LABEL.LOAN_COST); dailySupplySideRevenue.add(repaid[i].asset, cost, LABEL.LOAN_COST); }
    });
  }
  for (const { log, asset } of await logsByAsset(options, cashouts, EVENTS.cashedOut)) addFloorFee(floor, asset, log.platformFee, LABEL.TRADE_FEE);

  if (earnVaults.length) {
    for (const log of await options.getLogs({ targets: earnVaults, eventAbi: EVENTS.profitReported })) {
      dailyRevenue.add(usdg, log.fee, LABEL.EARN_FEE);
      dailyProtocolRevenue.add(usdg, log.fee, LABEL.EARN_FEE);
    }
  }

  // Intent: every fill's execution fee goes whole to the protocol recipient (the deal fee router, or a lend-asset
  // generation's fee processor, which sells it for USDG first); fees a vault earned outside a fill are swept once.
  for (const eventAbi of [EVENTS.filled, EVENTS.secondaryFilled]) {
    for (const { log, asset } of await logsByAsset(options, fillRouters, eventAbi)) addFloorShare(floor, asset, log.executionFee, LABEL.EXECUTION_FEE);
  }
  for (const { log, asset } of await logsByAsset(options, fillRouters, EVENTS.staleFeesSwept)) addFloorShare(floor, asset, log.amount, LABEL.EXECUTION_FEE);
  // Partner vaults are listed by their factory. A factory deployed after the window lists none; a failed count on a
  // deployed one fails the fetch, so the period is retried rather than booked without that factory's vaults.
  const toBlock = await options.getToBlock();
  const factories = U.intent.filter((g) => g.startBlock <= toBlock);
  const counts = factories.length ? await options.toApi.multiCall({ abi: "uint256:count", calls: factories.map((g) => g.factory) }) : [];
  const vaultCalls = factories.flatMap((g, i) => Array.from({ length: Number(counts[i]) }, (_, index) => ({ target: g.factory, params: [index], asset: g.asset })));
  const partnerVaults = vaultCalls.length ? await options.toApi.multiCall({ abi: "function vaults(uint256) view returns (address)", calls: vaultCalls.map(({ target, params }) => ({ target, params })) }) : [];
  const partners = partnerVaults.map((address: string, i: number) => ({ address, asset: vaultCalls[i].asset }));
  for (const { log, asset } of await logsByAsset(options, partners, EVENTS.profitReported)) {
    addFloorShare(floor, asset, (BigInt(log.fee) * PROTOCOL_SHARE_BPS) / 10_000n, LABEL.PARTNER_FEE);
  }

  return { dailyFees, dailyRevenue, dailyHoldersRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  pullHourly: true,
  start: U.start,
  methodology: {
    Fees: "Everything borrowers and traders pay on gage: the deal or origination fee taken when a loan funds, trade fees on sold reclaim rights and lender units, the cash-out platform fee, and the borrower's fixed cost paid to lenders at repayment (repayment cap minus principal). Fixed-cost loans have no interest accrual: the cost is booked when the loan is repaid. Intent lend-asset generations lend a stock token, and their amounts are in that token.",
    Revenue: "Deal, origination, trade and cash-out fees, the Earn performance fee on lender returns, and on Intent V1 the execution fee each fill takes from the partner vaults' return and the protocol's 10% of a partner vault's performance fee.",
    HoldersRevenue: "Deal, origination, trade and cash-out fees, the Intent execution fee and the protocol's share of partner vault performance fees: since D57 every one of them buys GAGE for the permanent GAGE-only floor bands of the GAGE/sGAGE pool.",
    ProtocolRevenue: "The Earn performance fee (curator and protocol shares).",
    SupplySideRevenue: "The borrower's fixed cost paid to lenders at repayment, before the Earn performance fee, the Intent execution fee and partner vault performance fees for loans an Earn strategy or a partner vault funded.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL.DEAL_FEE]: "1% of funded principal on legacy vaults; the registry feeBps of principal on V2 engines and Intent cores, charged at activation, once for a loan a bridged engine mirrors as a legacy deal.",
      [LABEL.TRADE_FEE]: "The registry trade fee on a sold reclaim right or lender unit; 0.5% of remaining proceeds on a cash-out.",
      [LABEL.LOAN_COST]: "Repayment cap minus funded principal, paid to the lender when the borrower reclaims.",
    },
    Revenue: {
      [LABEL.DEAL_FEE]: "Routed to the GAGE floor through DealFeeRouter.",
      [LABEL.TRADE_FEE]: "Routed to the GAGE floor through DealFeeRouter.",
      [LABEL.EARN_FEE]: "feeBps of a settled loan's return; the protocol share goes to the deal fee router, the rest to the curator.",
      [LABEL.EXECUTION_FEE]: "The execution fee a partner vault pays out of its loan's return when Gage fills a listing or a lender sale for it, credited whole to the protocol.",
      [LABEL.PARTNER_FEE]: "10% of a partner vault's performance fee, taken from the vault's settled return; the vault's manager keeps the rest.",
    },
    HoldersRevenue: {
      [LABEL.DEAL_FEE]: "Deal and origination fees buy GAGE for the permanent GAGE-only floor bands of the GAGE/sGAGE pool.",
      [LABEL.TRADE_FEE]: "Trade and cash-out fees buy GAGE for the permanent GAGE-only floor bands of the GAGE/sGAGE pool.",
      [LABEL.EXECUTION_FEE]: "Paid to DealFeeRouter, or to a lend-asset generation's fee processor that sells it for USDG first, and spent on GAGE for the floor bands.",
      [LABEL.PARTNER_FEE]: "Paid to the same route as the execution fee and spent on GAGE for the floor bands.",
    },
    ProtocolRevenue: {
      [LABEL.EARN_FEE]: "The Earn performance fee, covering both the protocol share sent to the deal fee router and the curator share.",
    },
    SupplySideRevenue: {
      [LABEL.LOAN_COST]: "Repayment cap minus funded principal, paid to the lender when the borrower reclaims, before the Earn performance fee, the Intent execution fee and partner vault performance fees.",
    },
  },
};

export default adapter;
