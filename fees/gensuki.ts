import { FetchOptions, Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived, addTokensReceived } from "../helpers/token";
import fetchURL from "../utils/fetchURL";

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) {
    const dailyFees = await getSolanaReceived({ options, target: '84L37ZcjLih9HNP4Np8yrTTQkdUx5aw3CYcx4ajboamT' });
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }

  // Base and other EVM chains
  const evmWallet = '0xC34E5159AA94dDf235790836Dc4bD4b2789B1fB9';
  try {
    const dailyFees = await addTokensReceived({ options, target: evmWallet });
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  } catch (e) {
    // Fallback to API if chain is not indexed or indexer fails
    const url = `https://app.gensuki.xyz/api/defillama/swap?chain=${options.chain}`;
    const res = await fetchURL(url);
    const dayData = res.history?.find((h: any) => h.date === options.dateString);

    return {
      dailyFees: dayData ? dayData.revenueUsd : 0,
      dailyRevenue: dayData ? dayData.revenueUsd : 0,
      dailyProtocolRevenue: dayData ? dayData.revenueUsd : 0,
    };
  }
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.SEI]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.APECHAIN]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-01-01',
    },
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: '2025-01-01',
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Users pay a swap aggregator fee of 1.0% on swaps and bridge transactions.",
    Revenue: "Protocol collects a 1.0% fee on all swaps and bridge transactions.",
    ProtocolRevenue: "All fee revenue is sent to the fee receiver wallets: 84L37ZcjLih9HNP4Np8yrTTQkdUx5aw3CYcx4ajboamT on Solana and 0xC34E5159AA94dDf235790836Dc4bD4b2789B1fB9 on Base chain."
  }
};

export default adapter;
