import * as sdk from "@defillama/sdk";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { getAlliumChain, queryAllium } from "../helpers/allium";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.BASE,
  CHAIN.OPTIMISM,
  CHAIN.POLYGON,
  CHAIN.BSC,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
];

// OP Mainnet token receipts are counted only before 2026-10-07. Users pay the fee wallet about $15 a day there, while from
// that day it received 24 lots of ~52,000 USDC of its own money from bridges, each swept onward within minutes. 14 are its
// own USDC sent from BSC (BSC 0x18bd961d997b32c0d657d1d1380cfc0f225c9a8772c2ea178034434908a9abb6 -> OP
// 0x9d6e1ea971efd2d0ba5ec5ed041ac1343ce830280f93d82993b2fd68cfc3da33), already counted when it first reached a fee wallet;
// the other 10 match no outflow on these chains. Bridge senders rotate. OP native-coin fees are still counted.
const OP_BRIDGED_USDC_FROM = 1791331200 // 2026-10-07

const LABELS = {
  TOKEN_FEES: 'Wallet Fees Paid In Tokens',
  NATIVE_FEES: 'Wallet Fees Paid In Native Coin',
  REFERRAL_FEES: 'Base App Coin Referral Fees',
}

const blacklistTokens = [
  '0x888888ae2c4a298efd66d162ffc53b3f2a869888',
  '0x618679df9efcd19694bb1daa8d00718eacfa2883',
  '0xff8bbc599ea030aa69d0298035dfe263740a95bc',
  '0xf2a92bc1cf798ff4de14502a9c6fda58865e8d5d',
  '0x7cd8c22d3f4b66230f73d7ffcb48576233c3fe33',
  '0xe552fb52a4f19e44ef5a967632dbc320b0820639',
  '0x35f3ffffcb622bc9f64fa561d74e983fd488d90c',
  '0x3fda9383a84c05ec8f7630fe10adf1fac13241cc',
  '0xb4357054c3dA8D46eD642383F03139aC7f090343',
  '0x3e4802f35A7B388EC78C2d3F6286Ddac2576F9fC',
  '0x60221580574d7c439ef909ab23d0d3e9598c3cd2',
  '0x1204Ac8C5e70C044943301bABD042f75d316bDE2',
  '0xc8f8c5a9dff280cde517d197c82ee10fcb46bb07',
  '0x4160efdd66521483c22cb98b57b87d1fdafeab07',
  '0x2da693e4c61d627e8cd607241673de26a1c646d7',
  '0x28cf04dd4c16998fceda8e00efe5a3796fffee81',
  '0x147120faEC9277ec02d957584CFCD92B56A24317',
]

function getFeeWallet(timestamp: number) {
  if (timestamp >= 1760572800) {
    return "0x5aafc1f252d544f744d17a4e734afd6efc47ede4"
  }
  else if (timestamp >= 1758067200) {
    return "0x8d413db42d6901de42b2c481cc0f6d0fd1c52828"
  }
  else {
    return "0x382fFCe2287252F930E1C8DC9328dac5BF282bA1"
  }
}

const baseAppPlatformReferrer = "0x55C88bB05602Da94fCe8FEadc1cbebF5B72c2453"

// Transactions the fee wallet sends itself are treasury operations: it swaps the fee tokens it holds for the native coin,
// sells that for USDC through LI.FI or 0x, and bridges the USDC out. What it receives in them is money it already had,
// e.g. Ethereum 0x232efad294acc636417e07248a18281d4245898bcf382234dacbaaa889a189b5 sells 36.8 ETH for 98,400 USDC.
const INDEXER_MAX_BLOCK_RANGE = 10_000

const getOwnTxHashes = async (options: FetchOptions, feeWallet: string) => {
  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()
  const hashes = new Set<string>()
  for (let start = fromBlock; start <= toBlock; start += INDEXER_MAX_BLOCK_RANGE) {
    const txs = await sdk.indexer.getTransactions({
      chain: options.chain,
      transactionType: 'from',
      addresses: [feeWallet],
      from_block: start,
      to_block: Math.min(start + INDEXER_MAX_BLOCK_RANGE - 1, toBlock),
    })
    for (const tx of txs ?? []) hashes.add(String(tx.hash).toLowerCase())
  }
  return hashes
}

// Native-coin fees reach the fee wallet as internal calls from routers and smart wallets, with no Transfer log, so they
// are read from Allium (as getETHReceived does), also leaving out the wallet's own transactions. One query for all chains.
const prefetch = async (options: FetchOptions) => {
  const feeWallet = getFeeWallet(options.startOfDay).toLowerCase()
  return queryAllium(chains.map((chain) => `
    SELECT '${chain}' AS chain, SUM(raw_amount) AS value
    FROM ${getAlliumChain(chain)}.assets.native_token_transfers
    WHERE to_address = '${feeWallet}'
      AND from_address != '${feeWallet}'
      AND transaction_from_address != '${feeWallet}'
      AND transfer_type = 'value_transfer'
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`).join('\n    UNION ALL'))
}

const fetch = async (options: FetchOptions) => {
  const feeWallet = getFeeWallet(options.startOfDay)
  const dailyFees = options.createBalances()

  if (options.chain !== CHAIN.OPTIMISM || options.startOfDay < OP_BRIDGED_USDC_FROM) {
    const ownTxHashes = await getOwnTxHashes(options, feeWallet)
    const tokenFees = await addTokensReceived({
      options,
      target: feeWallet,
      logFilter: (log) => !ownTxHashes.has(String(log.transactionHash).toLowerCase()),
    });
    dailyFees.addBalances(tokenFees, LABELS.TOKEN_FEES)
  }

  const defaultBlacklistedTokens = getDefaultDexTokensBlacklisted(options.chain)
  const allBlacklistedTokens = [...new Set([...blacklistTokens, ...defaultBlacklistedTokens])]

  for (const token of allBlacklistedTokens) {
    dailyFees.removeTokenBalance(token)
  }

  const nativeFees = options.preFetchedResults.find((row: any) => row.chain === options.chain)
  if (!nativeFees) throw new Error(`coinbase-wallet: no native fee row for ${options.chain}`)
  dailyFees.addGasToken(nativeFees.value ?? 0, LABELS.NATIVE_FEES)

  if (options.chain === CHAIN.BASE) {
    const zoraReferralFees = await addTokensReceived({
      options,
      target: baseAppPlatformReferrer
    })
    dailyFees.addBalances(zoraReferralFees, LABELS.REFERRAL_FEES)
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: 'All fees paid by users for trading, swapping, bridging in Coinbase Wallet, in tokens and in the native coin, and referral fees from coins created in the Base App. Excludes what the fee wallet receives in its own swaps. On OP Mainnet, token fees are counted only before 2026-10-07.',
    Revenue: 'Fees collected by Coinbase paid by users for trading, swapping, bridging in Coinbase Wallet, in tokens and in the native coin, and referral fees from coins created in the Base App. Excludes what the fee wallet receives in its own swaps. On OP Mainnet, token fees are counted only before 2026-10-07.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.TOKEN_FEES]: 'ERC20 tokens users pay the fee wallet for trading, swapping and bridging in Coinbase Wallet, except tokens it receives in transactions it sends itself. On OP Mainnet, only before 2026-10-07.',
      [LABELS.NATIVE_FEES]: 'Native coin users pay the fee wallet for trading, swapping and bridging in Coinbase Wallet, except in transactions it sends itself.',
      [LABELS.REFERRAL_FEES]: 'Tokens the Base App platform referrer receives from coins created in the Base App (Base only).',
    },
    Revenue: {
      [LABELS.TOKEN_FEES]: 'Token fees, all kept by Coinbase.',
      [LABELS.NATIVE_FEES]: 'Native-coin fees, all kept by Coinbase.',
      [LABELS.REFERRAL_FEES]: 'Base App referral fees, all kept by Coinbase.',
    },
  },
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  chains,
  prefetch,
  fetch,
};

export default adapter;
