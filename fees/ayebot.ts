import ADDRESSES from "../helpers/coreAssets.json";
import { Adapter, Dependencies, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { addTokensReceived, getETHReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

/**
 * Ayebot — self-custodial multichain Telegram trading bot (Solana + BSC).
 *
 * Fee flow (PLATFORM_FEE_TO_TREASURY_ENABLED = true):
 *  - Platform swap fees and leader copy-trading carry both land directly on a
 *    "hot" treasury wallet per chain (derived from the bot's key vault).
 *  - A periodic surplus sweep later forwards part of the native balance to a
 *    cold fee wallet, but that is downstream and partial, so fees are measured
 *    at the treasury where they first arrive in full.
 *
 * Assets received by the treasury:
 *  - Solana: native SOL (lamports) for both platform fees and carry.
 *  - BSC: WBNB for inline platform fees + native BNB for leader carry.
 *
 * Dimensions: all fees collected by the treasury are reported as dailyFees and,
 * since Ayebot is the recipient, as dailyRevenue / dailyProtocolRevenue.
 * All figures are derived from on-chain data; no off-chain API is used.
 */

// Hot treasury wallets (where fees land first, in full).
const SOL_TREASURY = "FaYFaP8f6JNzTuZ1gsKn7nRUKcVzJ4TiLqErWESBnLT4";
const BSC_TREASURY = "0xb49230598A51770Ccd5281B83e2CaF01086E61eA";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const fetchSolana = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

  // Inbound native SOL to the treasury (positive balance changes), excluding
  // any outbound-originated internal movements from the same wallet.
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

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetchBsc = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

  // Platform fees arrive as WBNB (inline KyberSwap).
  await addTokensReceived({
    options,
    balances: dailyFees,
    target: BSC_TREASURY,
    tokens: [WBNB],
  });

  // Leader carry arrives as native BNB.
  await getETHReceived({
    options,
    balances: dailyFees,
    target: BSC_TREASURY,
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All trading fees collected by Ayebot: per-swap platform fees and leader copy-trading carry, received on-chain by the treasury wallet on each chain (native SOL on Solana; WBNB plus native BNB on BSC).",
  Revenue: "All collected fees, received by the Ayebot treasury.",
  ProtocolRevenue: "All collected fees, received by the Ayebot treasury.",
};

const adapter: Adapter = {
  version: 2,
  methodology,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: "2026-05-22",
    },
    [CHAIN.BSC]: {
      fetch: fetchBsc,
      start: "2026-05-24",
    },
  },
  dependencies: [Dependencies.DUNE],
};

export default adapter;