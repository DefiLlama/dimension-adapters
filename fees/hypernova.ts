import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const USDC = ADDRESSES.arbitrum.USDC_CIRCLE;
const TREASURY = "0x924e3ed4fc2130b103470270b403b2a4ac808240";
const PAYOUT_VAULT = "0x920973eebffd3bf7da14dd9fb52bd3bea1664c67";
const REFERRAL_WALLET = "0x761483b729517b88c0f368935910a519dd00f201";

// protocol-controlled wallets: transfers with them are internal movements
const INTERNAL_WALLETS: Record<string, string> = {
  "0x43c5f0a81d538a527dbf35d27faa583ac7fada07": "cold payout reserve",
  [PAYOUT_VAULT]: "operational payout vault",
  "0x429d8f223acb622e5e748f6a7bdf1235b2334fcb": "TradingAccounts contract",
  "0xb39e80f9ee5c554d7ce6169878b803090ba0947c": "TradingAccounts contract",
  "0x88ee7cb41813639cac63f2f3209502d75388a44c": "payout reserve",
  [TREASURY]: "assessment treasury",
};

const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const PAYOUT_EVENT = "event PayoutProcessed(address indexed trader, uint256 traderAmount, uint256 protocolAmount)";
const transfer = new Interface([TRANSFER_EVENT]);
const toTreasuryTopics = transfer.encodeFilterTopics("Transfer", [null, TREASURY]) as string[];
const fromReferralTopics = transfer.encodeFilterTopics("Transfer", [REFERRAL_WALLET, null]) as string[];

const LABELS = {
  assessmentFees: "Assessment Fees",
  profitSplit: "Trader Profit Split",
  referrals: "Referral & Affiliate Commissions",
};

type TransferArgs = { from?: unknown; to?: unknown; value?: unknown };

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const fromBlock = (await options.getFromBlock()) + 1;
  const toBlock = await options.getToBlock();
  let assessmentFees = 0n, profitSplit = 0n, referrals = 0n;

  if (fromBlock <= toBlock) {
    const treasuryLogs: TransferArgs[] = await options.getLogs({ target: USDC, eventAbi: TRANSFER_EVENT, topics: toTreasuryTopics, fromBlock, toBlock });
    for (const { from, value } of treasuryLogs) {
      if (typeof from !== "string" || typeof value !== "bigint") throw new Error("Hypernova fees: malformed treasury Transfer log");
      if (INTERNAL_WALLETS[from.toLowerCase()] === undefined) assessmentFees += value;
    }

    const payoutLogs: { protocolAmount?: unknown }[] = await options.getLogs({ target: PAYOUT_VAULT, eventAbi: PAYOUT_EVENT, fromBlock, toBlock });
    for (const { protocolAmount } of payoutLogs) {
      if (typeof protocolAmount !== "bigint") throw new Error("Hypernova fees: malformed PayoutProcessed log");
      profitSplit += protocolAmount;
    }

    const referralLogs: TransferArgs[] = await options.getLogs({ target: USDC, eventAbi: TRANSFER_EVENT, topics: fromReferralTopics, fromBlock, toBlock });
    for (const { to, value } of referralLogs) {
      if (typeof to !== "string" || typeof value !== "bigint") throw new Error("Hypernova fees: malformed referral Transfer log");
      if (INTERNAL_WALLETS[to.toLowerCase()] === undefined) referrals += value;
    }
  }

  dailyFees.add(USDC, assessmentFees.toString(), LABELS.assessmentFees);
  dailyFees.add(USDC, profitSplit.toString(), LABELS.profitSplit);
  dailySupplySideRevenue.add(USDC, referrals.toString(), LABELS.referrals);
  dailyRevenue.add(USDC, (assessmentFees - referrals).toString(), LABELS.assessmentFees);
  dailyRevenue.add(USDC, profitSplit.toString(), LABELS.profitSplit);
  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2026-03-25",
  allowNegativeValue: true,
  methodology: {
    Fees: "Assessment fees paid in USDC, plus Hypernova's share of trader profits kept on each payout.",
    Revenue: "Assessment fees and Hypernova's profit share, minus referral and affiliate commissions.",
    SupplySideRevenue: "Referral and affiliate commissions paid out in USDC.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.assessmentFees]: "All USDC received by Hypernova's assessment treasury, except transfers from its own reserves, vault and contracts.",
      [LABELS.profitSplit]: "Hypernova's share of trader profits, kept in the payout vault on each payout.",
    },
    Revenue: {
      [LABELS.assessmentFees]: "Assessment fees minus referral and affiliate commissions.",
      [LABELS.profitSplit]: "Hypernova's share of trader profits, kept in the payout vault on each payout.",
    },
    SupplySideRevenue: {
      [LABELS.referrals]: "USDC paid to affiliates from Hypernova's referral wallet.",
    },
  },
};

export default adapter;
