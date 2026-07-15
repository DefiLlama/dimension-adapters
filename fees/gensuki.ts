import { FetchOptions, Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived, addTokensReceived } from "../helpers/token";

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) {
    const dailyFees = await getSolanaReceived({ options, target: '84L37ZcjLih9HNP4Np8yrTTQkdUx5aw3CYcx4ajboamT' });
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }

  // Base and other EVM chains
  const evmWallet = '0xC34E5159AA94dDf235790836Dc4bD4b2789B1fB9';
  const dailyFees = await addTokensReceived({ options, target: evmWallet });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.SEI]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.APECHAIN]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2026-01-01',
    },
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2026-07-01',
    },
  },
  isExpensiveAdapter: true,
  pullHourly: true,
  methodology: {
    Fees: "Users pay a swap aggregator fee of 1.0% on swaps and bridge transactions.",
    Revenue: "Protocol collects a 1.0% fee on all swaps and bridge transactions.",
    ProtocolRevenue: "All fee revenue is sent to the fee receiver wallets: 84L37ZcjLih9HNP4Np8yrTTQkdUx5aw3CYcx4ajboamT on Solana and 0xC34E5159AA94dDf235790836Dc4bD4b2789B1fB9 on Base chain."
  }
};

export default adapter;
