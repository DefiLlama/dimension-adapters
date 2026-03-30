/**
 * Genius Protocol — Fees / Revenue Adapter
 *
 * All inflows to the protocol fee collector wallets are reported as fees and revenue.
 * Intra-collector transfers are excluded to avoid double-counting.
 *
 * EVM collectors:
 *   0xf70853810b8fc6869068dc8f7f94c439c9a2cdca
 *   0x3409c15308a379e2ab9ab3c54eda8dd4fdc2ba42
 *   0x34dac76555ab52fab3eb7071fb864dbb8fa3752d
 *   0x03d7d9caf7498f524d17f5e863c12b88f546baad
 *
 * Solana collectors:
 *   BVziE3ADny6PePfxQzsdDUW15a1VjE4BUh9WbxV4fFus
 *   3vHMUuSvmBxvwY1RLLwvi7Xiaktq9984HrqFs8Ybkshx
 *   36nWszWtjg6t5qn1JSG5yk1CpLK8J8QfQPvE9aRV1gh3
 *   HYjmGWf2SJtLTV58Es4M3Vh2K5UBxAredtpPb22dvZuL
 *   37LTs1U4ycmtUQLCgoiiNb5WG4ph8rb54WSZvRsYwyUx
 */

import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived, getSolanaReceived } from "../../helpers/token";

const EVM_FEE_COLLECTORS = [
  '0xf70853810b8fc6869068dc8f7f94c439c9a2cdca',
  '0x3409c15308a379e2ab9ab3c54eda8dd4fdc2ba42',
  '0x34dac76555ab52fab3eb7071fb864dbb8fa3752d',
  '0x03d7d9caf7498f524d17f5e863c12b88f546baad',
];

const EVM_COLLECTORS_SET = new Set(EVM_FEE_COLLECTORS);

const SOLANA_FEE_COLLECTORS = [
  'BVziE3ADny6PePfxQzsdDUW15a1VjE4BUh9WbxV4fFus',
  '3vHMUuSvmBxvwY1RLLwvi7Xiaktq9984HrqFs8Ybkshx',
  '36nWszWtjg6t5qn1JSG5yk1CpLK8J8QfQPvE9aRV1gh3',
  'HYjmGWf2SJtLTV58Es4M3Vh2K5UBxAredtpPb22dvZuL',
  '37LTs1U4ycmtUQLCgoiiNb5WG4ph8rb54WSZvRsYwyUx',
];

const fetchEVM = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  for (const addr of EVM_FEE_COLLECTORS) {
    try {
      await addTokensReceived({
        options,
        target: addr,
        balances: dailyFees,
        logFilter: (log: any) => !EVM_COLLECTORS_SET.has(log.from?.toLowerCase()),
      });
    } catch (e) {
      console.warn(`[genius-protocol] token inflows skipped (${options.chain}, ${addr}): ${(e as Error).message}`);
    }

    if (options.chain !== CHAIN.HYPERLIQUID) {
      try {
        await getETHReceived({
          options,
          balances: dailyFees,
          target: addr,
          notFromSenders: EVM_FEE_COLLECTORS.filter(a => a !== addr),
        });
      } catch (e) {
        console.warn(`[genius-protocol] native inflows skipped (${options.chain}, ${addr}): ${(e as Error).message}`);
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  for (const addr of SOLANA_FEE_COLLECTORS) {
    try {
      await getSolanaReceived({
        options,
        balances: dailyFees,
        target: addr,
        blacklists: SOLANA_FEE_COLLECTORS.filter(a => a !== addr),
      });
    } catch (e) {
      console.warn(`[genius-protocol] inflows skipped (solana, ${addr}): ${(e as Error).message}`);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const EVM_CHAINS = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.AVAX,
  CHAIN.ARBITRUM,
  CHAIN.OPTIMISM,
  CHAIN.BASE,
  CHAIN.SONIC,
  CHAIN.HYPERLIQUID,
];

const evmAdapter = Object.fromEntries(
  EVM_CHAINS.map((chain) => [
    chain,
    { fetch: fetchEVM },
  ])
);

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All ERC-20 token and native coin inflows to the Genius Protocol fee collector wallets on each chain. Intra-collector transfers are excluded.",
    Revenue: "All inflows are protocol revenue (100% of fees accrue to the protocol).",
  },
  breakdownMethodology: {
    Fees: {
      "Terminal Trading Fees": "Swap fees collected by the Genius Protocol terminal across all supported chains, received as ERC-20 tokens and native coins into the protocol fee collector wallets.",
    },
    Revenue: {
      "Terminal Trading Fees": "All terminal trading fees accrue to the protocol as revenue.",
    },
  },
  start: '2026-01-01',
  adapter: {
    ...evmAdapter,
    [CHAIN.SOLANA]: { fetch: fetchSolana },
  },
  isExpensiveAdapter: true,
};

export default adapter;
