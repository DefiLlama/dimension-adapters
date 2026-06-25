import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryDuneSql } from "../helpers/dune";
import { addTokensReceived, getETHReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

/**
 * Ayebot — self-custodial multichain Telegram trading bot (Solana + BSC).
 *
 * Swap platform fees and leader copy-trading carry are both collected on-chain
 * by the protocol treasury wallet on each chain, where fees are measured:
 *  - Solana: native SOL (lamports) for both platform fees and carry.
 *  - BSC: WBNB for inline platform fees + native BNB for leader carry.
 * All collected fees are protocol revenue (Ayebot is the recipient).
 * All figures are derived from on-chain data; no off-chain API is used.
 */

// Treasury wallets — verified on-chain as the recipients of fee inflows.
const SOL_TREASURY = "FaYFaP8f6JNzTuZ1gsKn7nRUKcVzJ4TiLqErWESBnLT4";
const BSC_TREASURY = "0xb49230598A51770Ccd5281B83e2CaF01086E61eA";
// Canonical Wrapped BNB (WBNB) token on BSC.
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const chainConfig: Record<string, { start: string; treasury: string }> = {
  [CHAIN.SOLANA]: { start: "2026-05-22", treasury: SOL_TREASURY },
  [CHAIN.BSC]: { start: "2026-05-24", treasury: BSC_TREASURY },
};

async function fetchSolana(options: FetchOptions, treasury: string) {
  const dailyFees = options.createBalances();
  // Inbound native SOL to the treasury (positive balance changes), excluding
  // transactions where the treasury also sends out (internal movements).
  const query = `
    SELECT COALESCE(SUM(balance_change), 0) AS lamports
    FROM solana.account_activity
    WHERE TIME_RANGE
      AND tx_success
      AND address = '${treasury}'
      AND balance_change > 0
      AND tx_id NOT IN (
        SELECT tx_id FROM solana.account_activity
        WHERE TIME_RANGE
          AND address = '${treasury}'
          AND balance_change < 0
      )
  `;
  const [row] = await queryDuneSql(options, query);
  dailyFees.add(ADDRESSES.solana.SOL, Number(row?.lamports ?? 0), METRIC.TRADING_FEES);
  return dailyFees;
}

async function fetchBsc(options: FetchOptions, treasury: string) {
  const dailyFees = options.createBalances();
  // Platform fees arrive as WBNB (inline KyberSwap).
  await addTokensReceived({ options, balances: dailyFees, target: treasury, tokens: [WBNB] });
  // Leader carry arrives as native BNB.
  await getETHReceived({ options, balances: dailyFees, target: treasury });
  return dailyFees;
}

async function fetch(options: FetchOptions) {
  const { treasury } = chainConfig[options.chain];
  const dailyFees =
    options.chain === CHAIN.SOLANA
      ? await fetchSolana(options, treasury)
      : await fetchBsc(options, treasury);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, cfg]) => [chain, { fetch, start: cfg.start }])
  ),
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading fees collected by Ayebot: per-swap platform fees and leader copy-trading carry, received on-chain by the treasury wallet on each chain (native SOL on Solana; WBNB plus native BNB on BSC).",
    Revenue: "All collected fees, received by the Ayebot treasury.",
    ProtocolRevenue: "All collected fees, received by the Ayebot treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "All trading fees (platform fees + leader carry) received by the Ayebot treasury.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "All collected fees, retained by Ayebot.",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]: "All collected fees, retained by Ayebot.",
    },
  },
};

export default adapter;