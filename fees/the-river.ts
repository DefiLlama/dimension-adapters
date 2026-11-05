import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getTransactionsWithRetry } from "../helpers/getTxReceipts";

/**
 * The River (https://theriver.markets): a non-custodial web app for buying and selling tokenized US stocks
 * (ST0x wt* tokens, Coinbase-issued stock tokens, Robinhood Chain stock tokens) from the user's own wallet,
 * on Base and Robinhood Chain. It charges an interface fee of 0.10% (10 bps) on market trades, always in the
 * USD stablecoin side of the trade (USDC on Base, USDG on Robinhood Chain), paid to The River's treasury inside
 * the trade transaction. The treasury keeps the whole fee: there is no LP, referrer or token-holder share.
 *
 * Two on-chain paths carry the fee, and both emit an event naming it:
 *  1. Raindex order fills on Base go through RiverTaker (no owner, immutable fee receiver and 10 bps fee),
 *     which emits RiverTake(user, tokenIn, tokenOut, spent, received, fee) with the fee in USDC.
 *     Source verified (Sourcify full match): https://repo.sourcify.dev/8453/0xd0daDF272d6c07129c058B937B867428A46c4fDb
 *  2. Routed swaps (Base and Robinhood Chain) go through the KyberSwap MetaAggregationRouterV2 with
 *     feeReceiver = treasury, feeAmount = 10, isInBps = true. The router pays the fee and emits
 *     Fee(token, totalAmount, totalFee, recipients, amounts, isBps); only the share paid to the treasury counts.
 *
 * Trades signed by The River's own test wallet are excluded: their fee goes from one River wallet to another.
 */

// The River treasury, the only fee receiver on both chains.
const TREASURY = "0xA589AC52653C55E7C6B574eF18C19c43b99bCb37";
// The River's own test (canary) wallet; its trades pay the fee to ourselves, so they are not counted.
const OWN_TEST_WALLETS = new Set(["0x944f1dafb62f6886336660b31b87f9f7613496de"]);

const RIVER_TAKER = "0xd0daDF272d6c07129c058B937B867428A46c4fDb"; // Base only
const RIVER_TAKE_EVENT = "event RiverTake(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 spent, uint256 received, uint256 fee)";
// RiverTaker charges its fee in USDC on Base (immutable USDC in the contract).
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// KyberSwap MetaAggregationRouterV2, same address on Base and Robinhood Chain.
const KYBER_ROUTER = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";
const KYBER_FEE_EVENT = "event Fee(address token, uint256 totalAmount, uint256 totalFee, address[] recipients, uint256[] amounts, bool isBps)";

// First fee paid to the treasury on Base: KyberSwap Fee event in
// https://basescan.org/tx/0x645e6efc58f1cab5ac3931d8b384bfb4cd0e642e2a6ae9d3f6146c43661c5e8d (2026-10-01).
// Robinhood Chain: the same fee receiver was configured on 2026-10-01. A scan from block 78000000 (2026-10-02)
// found no Fee event paying the treasury before tx 0xc4b1fc74eb0fbb3c1bcc2839f874bbe2b0489c280c422df75769ff3be0e8de8e
// (block 105768375, 2026-11-04), so the zero days before it are correct.
const chainConfig: Record<string, { start: string; riverTaker?: string }> = {
  [CHAIN.BASE]: { start: "2026-10-01", riverTaker: RIVER_TAKER },
  [CHAIN.ROBINHOOD]: { start: "2026-10-01" },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const treasury = TREASURY.toLowerCase();
  const { riverTaker } = chainConfig[options.chain];

  // Fee payments to the treasury in this window: [txHash, token, amount].
  const payments: [string, string, bigint][] = [];
  if (riverTaker) {
    const takes = await options.getLogs({ target: riverTaker, eventAbi: RIVER_TAKE_EVENT, onlyArgs: false });
    for (const log of takes) payments.push([log.transactionHash, USDC_BASE, BigInt(log.args.fee)]);
  }
  const feeLogs = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_FEE_EVENT, onlyArgs: false });
  for (const log of feeLogs) {
    const { token, totalAmount, recipients, amounts, isBps } = log.args;
    recipients.forEach((recipient: string, i: number) => {
      if (recipient.toLowerCase() !== treasury) return;
      // With isBps the amounts are basis points of totalAmount (The River sends 10 = 0.10%), otherwise token amounts.
      const amount = isBps ? (BigInt(totalAmount) * BigInt(amounts[i])) / 10000n : BigInt(amounts[i]);
      payments.push([log.transactionHash, token, amount]);
    });
  }
  if (!payments.length) return { dailyFees, dailyUserFees: dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };

  // The test wallet sometimes trades through other contracts (e.g. an Euler batch), so the event's sender is not
  // always the wallet: exclude by the transaction's signer instead. Fee payments are few, so this is cheap.
  const hashes = [...new Set(payments.map(([hash]) => hash.toLowerCase()))];
  const txs = await getTransactionsWithRetry(options.chain, hashes);
  const signer: Record<string, string> = {};
  hashes.forEach((hash, i) => {
    const tx = txs[i];
    if (!tx || !tx.from) throw new Error(`the-river: transaction ${hash} not found on ${options.chain}`);
    signer[hash] = tx.from.toLowerCase();
  });
  for (const [hash, token, amount] of payments) {
    if (OWN_TEST_WALLETS.has(signer[hash.toLowerCase()])) continue;
    dailyFees.add(token, amount, METRIC.TRADING_FEES);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "The River's 0.10% interface fee on market trades of tokenized stocks, paid by the trader in USDC (Base) or USDG (Robinhood Chain), read from RiverTaker RiverTake events and KyberSwap router Fee events that pay The River's treasury. Trades from The River's own test wallet are excluded.",
  UserFees: "The whole interface fee is paid by the trader.",
  Revenue: "The treasury keeps the whole fee.",
  ProtocolRevenue: "The treasury keeps the whole fee.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "0.10% interface fee on market trades, in USDC on Base and USDG on Robinhood Chain, paid to The River's treasury in the trade transaction.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "0.10% interface fee paid by the trader.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "0.10% interface fee, all kept by The River's treasury.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "0.10% interface fee, all kept by The River's treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
