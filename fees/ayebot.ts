import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryDuneSql } from "../helpers/dune";
import { addTokensReceived, getETHReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

/**
 * Ayebot — self-custodial multichain Telegram trading bot (Solana + BSC).
 *
 * Swap platform fees and leader copy-trading carry are collected on-chain by
 * the protocol treasury wallet on each chain, where fees are measured:
 *  - Solana: native SOL (lamports), both platform fees and carry.
 *  - BSC: WBNB (inline platform fees) + native BNB (four.meme platform fee and
 *    leader carry).
 *
 * Only dailyFees is reported. Part of the inflow (leader carry) is later
 * redistributed to leaders — a supply-side cost — but that share is not
 * separable on-chain from the inbound flow, so neither a clean protocol-revenue
 * nor a supply-side figure can be derived. skipBreakdownValidation is set for
 * this reason, rather than aliasing gross fees to revenue. All figures on-chain.
 */

// Treasury wallet — recipient of fee inflows on each chain. Verified on-chain
// as the sender of the periodic surplus sweep to the cold fee wallet:
//  - Solana treasury: https://solscan.io/account/FaYFaP8f6JNzTuZ1gsKn7nRUKcVzJ4TiLqErWESBnLT4
//  - BSC treasury:    https://bscscan.com/address/0xb49230598A51770Ccd5281B83e2CaF01086E61eA
const SOL_TREASURY = "FaYFaP8f6JNzTuZ1gsKn7nRUKcVzJ4TiLqErWESBnLT4";
const BSC_TREASURY = "0xb49230598A51770Ccd5281B83e2CaF01086E61eA";
// Cold fee wallet (historical/fallback recipient), tracked alongside the
// treasury and used as an internal-sender filter to net out the surplus sweep:
//  https://bscscan.com/address/0x59cB774c3462D11C36F56E3a4007379Ea77299d3
const BSC_FEE_WALLET = "0x59cB774c3462D11C36F56E3a4007379Ea77299d3";
// Canonical Wrapped BNB (WBNB) on BSC:
//  https://bscscan.com/token/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const BSC_SINKS = [BSC_TREASURY, BSC_FEE_WALLET];

// Start dates = first on-chain fee inflow observed on each treasury.
const chainConfig: Record<string, { start: string }> = {
  [CHAIN.SOLANA]: { start: "2026-05-22" },
  [CHAIN.BSC]: { start: "2026-05-24" },
};

async function fetchSolana(options: FetchOptions) {
  const dailyFees = options.createBalances();
  // Inbound native SOL to the treasury (positive balance changes), excluding
  // transactions where the treasury also sends out (internal movements).
  const query = `
    SELECT COALESCE(SUM(balance_change), 0) AS lamports
    FROM solana.account_activity
    WHERE TIME_RANGE
      AND tx_success
      AND address = '${SOL_TREASURY}'
      AND balance_change > 0
      AND tx_id NOT IN (
        SELECT tx_id FROM solana.account_activity
        WHERE TIME_RANGE
          AND address = '${SOL_TREASURY}'
          AND balance_change < 0
      )
  `;
  const [row] = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, Number(row?.lamports ?? 0), METRIC.TRADING_FEES);
  return dailyFees;
}

async function fetchBsc(options: FetchOptions) {
  const dailyFees = options.createBalances();
  // Native BNB fees (four.meme platform fee + leader carry). notFromSenders
  // excludes the two protocol wallets, netting out the internal surplus sweep
  // in both directions; genuine fees are always sent by user/follower wallets.
  await getETHReceived({ options, balances: dailyFees, targets: BSC_SINKS, notFromSenders: BSC_SINKS });
  // Inline KyberSwap platform fees arrive as WBNB (ERC-20). No internal sweep
  // moves WBNB, so no sender filter is needed.
  await addTokensReceived({ options, balances: dailyFees, targets: BSC_SINKS, tokens: [WBNB] });
  return dailyFees;
}

async function fetch(options: FetchOptions) {
  const dailyFees =
    options.chain === CHAIN.SOLANA
      ? await fetchSolana(options)
      : await fetchBsc(options);
  return { dailyFees };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, cfg]) => [chain, { fetch, start: cfg.start }])
  ),
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  // Leader carry redistributed to leaders is a supply-side cost, but it is not
  // separable on-chain from the inbound fee flow, so no revenue/supply-side
  // split can be derived. Only gross dailyFees is reported.
  skipBreakdownValidation: true,
  methodology: {
    Fees: "All trading fees paid by users and collected by the Ayebot treasury: per-swap platform fees and leader copy-trading carry (native SOL on Solana; WBNB plus native BNB on BSC).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Platform fees and leader carry received by the Ayebot treasury.",
    },
  },
};

export default adapter;