import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";
import { queryDuneSql } from "../helpers/dune";

const W_914B = "0x914B776bf3C8915FD47Fd31B960F5F3990AA35B3";
const W_5876 = "0x5876b8367762b15411b4608d188808010b33c395";
const W_89C8 = "0x89C8b951A2B216fd185034C6D7ca19d40EF5C7DB";

const SOLANA_PROGRAM = "stPdYNaJNsV3ytS9Xtx4GXXXRcVqVS6x66ZFa26K39S";
const SOLANA_FEE_WALLET = "F2Vvt5KT33bUWnQtmGGJ4o2VW1BRXcJHucfi8ExW8JvX";

// feeWallets: first entry is deployment, later ones come from UpdateConfig events 
const config: Record<string, { start: string; feeWallets?: [number, string][] }> = {
  [CHAIN.SOLANA]: { start: "2023-12-13" },
  [CHAIN.ETHEREUM]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1713398400 /* 2024-04-18 */, W_5876], [1758758400 /* 2025-09-25 */, W_89C8], [1758758400, W_5876]] },
  [CHAIN.BASE]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1713398400 /* 2024-04-18 */, W_5876]] },
  [CHAIN.ERA]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1716422400 /* 2024-05-23 */, W_5876]] },
  [CHAIN.ARBITRUM]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1716422400 /* 2024-05-23 */, W_5876]] },
  [CHAIN.BSC]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1711065600 /* 2024-03-22 */, W_5876], [1763942400 /* 2025-11-24 */, W_89C8], [1763942400, W_5876], [1777593600 /* 2026-05-01 */, W_89C8]] },
  [CHAIN.OPTIMISM]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1762819200 /* 2025-11-11 */, W_5876]] },
  [CHAIN.LINEA]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1712620800 /* 2024-04-09 */, W_5876]] },
  [CHAIN.MODE]: { start: "2024-02-15", feeWallets: [[1707955200, W_914B], [1713484800 /* 2024-04-19 */, W_5876]] },
  [CHAIN.SCROLL]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1713484800 /* 2024-04-19 */, W_5876]] },
  [CHAIN.TAIKO]: { start: "2024-06-01", feeWallets: [[1717200000, W_5876]] },
  [CHAIN.BERACHAIN]: { start: "2025-02-06", feeWallets: [[1738800000, W_5876]] },
  [CHAIN.AVAX]: { start: "2024-01-29", feeWallets: [[1706486400, W_914B], [1740355200 /* 2025-02-24 */, W_5876]] },
  [CHAIN.HYPERLIQUID]: { start: "2025-02-18", feeWallets: [[1739836800, W_5876]] },
  [CHAIN.ABSTRACT]: { start: "2025-01-27", feeWallets: [[1737936000, W_914B], [1740441600 /* 2025-02-25 */, W_5876]] },
};

const fetchEvm = async (options: FetchOptions) => {
  const timeline = config[options.chain].feeWallets!;
  // wallet active at a given time = last timeline entry on or before it;
  // checking both window edges covers rotation days (both wallets that day)
  const activeAt = (ts: number) => [...timeline].reverse().find(([from]) => from <= ts)?.[1] ?? timeline[0][1];
  const targets = [...new Set([activeAt(options.startTimestamp), activeAt(options.endTimestamp)])];

  const received = await addTokensReceived({ options, targets });
  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, METRIC.TRADING_FEES);
  return dailyFees;
};

const solSql = () => `
    WITH whales_txs AS (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE tx_success
          AND executing_account = '${SOLANA_PROGRAM}'
          AND is_inner = false
          AND TIME_RANGE
    )
    SELECT
        t.token_mint_address AS mint,
        SUM(t.amount) AS amount
    FROM tokens_solana.transfers t
    JOIN whales_txs w ON t.tx_id = w.tx_id
    WHERE t.to_owner = '${SOLANA_FEE_WALLET}'
      AND TIME_RANGE
    GROUP BY t.token_mint_address
`;

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const rows = await queryDuneSql(options, solSql());
  for (const row of rows || []) {
    if (row.mint && row.amount) dailyFees.add(row.mint, row.amount, METRIC.TRADING_FEES);
  }
  return dailyFees;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.chain === CHAIN.SOLANA ? await fetchSolana(options) : await fetchEvm(options);

  // no holders/protocol split: current docs describe staker rewards only as
  // open-market $WHALES buybacks with no stated share of fees
  // (https://docs.whales.market/staking-mechanism)
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: config,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "All tokens received by the protocol's fee wallets (verified via the pre-market contracts' config/UpdateConfig history on EVM and the program config account on Solana): settlement fees from both sides and cancellation fees.",
    Revenue: "All fees collected by the protocol. No holders/protocol split is reported: current docs describe staker rewards only as open-market $WHALES buybacks with no stated share of fees. Affiliate/referral shares (up to 40% of a referred trade's fee per docs) are not separately identifiable on-chain; observed settlements send the full fee to the fee wallets, which are accumulate-only.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Pre-market settlement fees (2.5% from each side, per contract config) and cancellation/close fees (0.5%), received by the protocol fee wallets.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "All pre-market fees are kept by the protocol; no on-chain split to stakers or others is observable.",
    },
  },
};

export default adapter;
