import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getAlliumChain, queryAllium } from "../helpers/allium";
import { addTokensReceived } from "../helpers/token";

// Revoke.cash wallets, from packages/core/lib/constants.ts in https://github.com/RevokeCash/revoke.cash
const FEES_ADDRESS = '0xee826edbf34f4f33dad062405d7fbfdfdf405205'; // fees.revoke.eth, receives batch revoke fees since the premium launch on 2026-07-16
const SUBSCRIPTIONS_ADDRESS = '0x92ba92fd6a20eaf141f7af1483e196bbc0513eaf'; // subscriptions.revoke.eth, receives Premium and Ultimate payments
const REVOKE_WALLETS = [
  '0xfcbf17200c64e860f6639aa12b525015d115f863', // revoke.eth, donations (and batch revoke fees before 2026-07-16, mixed with donations so not tracked)
  FEES_ADDRESS,
  SUBSCRIPTIONS_ADDRESS,
  '0xd08e8bb3d754641bbf6dd2e797b1b52703f00486', // delegations.revoke.eth, auto revoke
  '0x6cad02d9d75660fbf237394ec8463c616e7e26e7', // cold.delegations.revoke.eth, auto revoke
  '0x5862ab2f23c4241d64b99d509d50b2483a23a793', // hot-1.delegations.revoke.eth, auto revoke executor
  '0xe27418d01359a632fede71710d3091bea98a4958', // hot-2.delegations.revoke.eth, auto revoke executor
];

// Revoke.cash moves its fee and subscription balances to Kraken, bridging them first when Kraken has no route on that
// chain (packages/core/lib/admin/treasury-routes.ts). Bridged funds are delivered back to the same wallets, so the bridge
// solvers that deliver them are not customers.
const TREASURY_BRIDGE_SOLVERS = [
  '0xf70da97812cb96acdf810712aa562db8dfa3dbef', // Relay solver, e.g. 991.88 USDC on Base: 0xae1c5a550e1e884dcda3458f70634f51d58a62b6270a6fa0851b50ecff31d704
];

// The batch revoke fee is a fixed $1.50 per batch, paid in the chain's native token (BATCH_REVOKE_FEE_USD_CENTS = 150 in
// packages/core/lib/constants.ts). Bigger native inflows to the fees wallet are treasury operations: swaps, bridge
// deliveries and transfers from revoke.eth, e.g. $2,307 from revoke.eth on Ethereum:
// 0x5d53417240710540a7e3088488f93ad0a7fe9955b4a66cc67b21fccb1f493117
const MAX_BATCH_FEE_USD = 5;

// Premium payments are accepted in USDC and USDT on these chains (packages/core/lib/premium/payment-config.ts)
const SUBSCRIPTION_TOKENS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', '0xdAC17F958D2ee523a2206206994597C13D831ec7'],
  [CHAIN.BSC]: ['0x8AC76a51cc950d9822D68b83Fe1Ad97B32Cd580d', '0x55d398326f99059fF775485246999027B3197955'],
  [CHAIN.POLYGON]: ['0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'],
  [CHAIN.BASE]: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bDa02913', '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'],
  [CHAIN.OPTIMISM]: ['0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'],
  [CHAIN.ARBITRUM]: ['0xaf88d065e77c8cC2239327C5EDb3A432268e5831', '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'],
};

// batchFees: whether users pay the batch revoke fee there. Optimism and Monad sponsor the fee
// (packages/core/lib/batch-revokes/sponsors.ts), so Optimism only has subscription payments.
// Starts are the first day with a payment on each chain. Revoke.cash charges on more chains, but these are the
// ones with fees paid that Allium indexes (no native transfer tables for HyperEVM, Abstract, Taiko, Flow EVM, Metis, opBNB)
const chainConfig: Record<string, { start: string; batchFees: boolean }> = {
  [CHAIN.ETHEREUM]: { start: '2026-07-16', batchFees: true },
  [CHAIN.ROBINHOOD]: { start: '2026-07-16', batchFees: true },
  [CHAIN.BSC]: { start: '2026-07-16', batchFees: true },
  [CHAIN.BASE]: { start: '2026-07-16', batchFees: true },
  [CHAIN.ARBITRUM]: { start: '2026-07-16', batchFees: true },
  [CHAIN.POLYGON]: { start: '2026-07-16', batchFees: true },
  [CHAIN.SONEIUM]: { start: '2026-07-17', batchFees: true },
  [CHAIN.APECHAIN]: { start: '2026-07-19', batchFees: true },
  [CHAIN.AVAX]: { start: '2026-07-19', batchFees: true },
  [CHAIN.INK]: { start: '2026-07-19', batchFees: true },
  [CHAIN.MANTLE]: { start: '2026-07-20', batchFees: true },
  [CHAIN.XDAI]: { start: '2026-07-21', batchFees: true },
  [CHAIN.PLASMA]: { start: '2026-07-21', batchFees: true },
  [CHAIN.LINEA]: { start: '2026-07-22', batchFees: true },
  [CHAIN.RONIN]: { start: '2026-07-22', batchFees: true },
  [CHAIN.SCROLL]: { start: '2026-07-22', batchFees: true },
  [CHAIN.ERA]: { start: '2026-07-23', batchFees: true },
  [CHAIN.SONIC]: { start: '2026-07-23', batchFees: true },
  [CHAIN.MODE]: { start: '2026-07-23', batchFees: true },
  [CHAIN.CELO]: { start: '2026-07-29', batchFees: true },
  [CHAIN.BERACHAIN]: { start: '2026-08-12', batchFees: true },
  [CHAIN.BLAST]: { start: '2026-08-15', batchFees: true },
  [CHAIN.UNICHAIN]: { start: '2026-08-18', batchFees: true },
  [CHAIN.MEGAETH]: { start: '2026-08-20', batchFees: true },
  [CHAIN.SEI]: { start: '2026-09-09', batchFees: true },
  [CHAIN.WC]: { start: '2026-09-24', batchFees: true },
  [CHAIN.OPTIMISM]: { start: '2026-09-29', batchFees: false },
};

const toList = (addresses: string[]) => '(' + addresses.map((address) => `'${address.toLowerCase()}'`).join(', ') + ')';

// One Allium query for the batch revoke fees of every chain, in USD at the time of each transfer. Native transfers
// include internal ones, which is how batching wallets pay the fee alongside the revokes.
const prefetch = async (options: FetchOptions) => {
  const chains = Object.entries(chainConfig).filter(([, config]) => config.batchFees).map(([chain]) => getAlliumChain(chain));
  const query = chains.map((chain) => `
    SELECT '${chain}' AS chain, COUNT(*) AS transfers, SUM(usd_amount) AS fees_usd
    FROM ${chain}.assets.native_token_transfers
    WHERE to_address = '${FEES_ADDRESS}'
      AND transfer_type = 'value_transfer'
      AND from_address NOT IN ${toList(REVOKE_WALLETS)}
      AND transaction_from_address NOT IN ${toList(REVOKE_WALLETS)}
      AND usd_amount <= ${MAX_BATCH_FEE_USD}
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`).join('\n    UNION ALL');
  return queryAllium(query);
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const { batchFees } = chainConfig[options.chain];

  if (batchFees) {
    const row = options.preFetchedResults.find((r: any) => r.chain === getAlliumChain(options.chain));
    if (!row) throw new Error(`revoke-cash: no batch revoke fee row for ${options.chain}`);
    dailyFees.addUSDValue(Number(row.fees_usd || 0), 'Batch Revoke Fees');
  }

  const tokens = SUBSCRIPTION_TOKENS[options.chain];
  if (tokens) {
    const subscriptions = await addTokensReceived({
      options,
      target: SUBSCRIPTIONS_ADDRESS,
      tokens,
      logFilter: (log) => !TREASURY_BRIDGE_SOLVERS.includes(log.from) && !REVOKE_WALLETS.includes(log.from),
    });
    dailyFees.add(subscriptions, 'Premium Subscription Fees');
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  prefetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'Batch revoke fees ($1.50 per batch, paid in the native token by free users) and Revoke Premium and Ultimate subscription payments in USDC and USDT. Refunds are not deducted.',
    Revenue: 'All batch revoke fees and subscription payments, kept by Revoke.cash.',
    ProtocolRevenue: 'All batch revoke fees and subscription payments, sent to Revoke.cash wallets.',
  },
  breakdownMethodology: {
    Fees: {
      'Batch Revoke Fees': 'Fixed $1.50 fee per batch revoke paid by free users in the native token, except on chains where a sponsor covers it.',
      'Premium Subscription Fees': 'Yearly Revoke Premium ($99) and Ultimate ($199) payments in USDC and USDT.',
    },
    Revenue: {
      'Batch Revoke Fees': 'Batch revoke fees kept by Revoke.cash.',
      'Premium Subscription Fees': 'Subscription payments kept by Revoke.cash.',
    },
    ProtocolRevenue: {
      'Batch Revoke Fees': 'Batch revoke fees sent to the fees.revoke.eth wallet.',
      'Premium Subscription Fees': 'Subscription payments sent to the subscriptions.revoke.eth wallet.',
    },
  },
};

export default adapter;
