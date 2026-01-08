import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getSolanaReceived } from "../../helpers/token";

// Fee collector / settlement contracts
const contracts: Record<string, string[]> = {
  [CHAIN.SOLANA]: ["GDsMbTq82sYcxPRLdQ9RHL9ZLY3HNVpXjXtCnyxpb2rQ"],
  [CHAIN.ETHEREUM]: ["0x1eCdB32e59e948C010a189a0798C674a2d0c6603"],
  [CHAIN.ARBITRUM]: ["0x7a560269480ef38b885526c8bbecdc4686d8bf7a"],
  [CHAIN.MERLIN]: ["0x7a560269480ef38b885526c8bbecdc4686d8bf7a"],
  [CHAIN.MANTA]: ["0x231c9bd15657dfa6977a1b8c76737c81e3c61a83"],
  [CHAIN.BLAST]: ["0x7a560269480Ef38B885526C8bBecdc4686d8bF7A"],
  [CHAIN.BASE]: ["0xdf02eeaB3CdF6eFE6B7cf2EB3a354dCA92A23092"],
  [CHAIN.BSC]: ["0x7a560269480Ef38B885526C8bBecdc4686d8bF7A"],
  [CHAIN.LINEA]: ["0x7a560269480Ef38B885526C8bBecdc4686d8bF7A"],
  [CHAIN.MODE]: ["0x7a560269480Ef38B885526C8bBecdc4686d8bF7A"],
  [CHAIN.OPTIMISM]: ["0xE3b7427C799353cfaDDdc1549967263952f17bd3"],
  [CHAIN.SCROLL]: ["0x7a560269480ef38b885526c8bbecdc4686d8bf7a"],
};

// ---------- EVM CHAINS ----------
const fetchEVM = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const targets = contracts[options.chain];

  if (!targets) return { dailyFees };

  // Track all tokens received by fee collector contracts
  await addTokensReceived({
    options,
    targets,
    balances: dailyFees,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),        // 100% of fees
    dailyHoldersRevenue: dailyFees.clone(0.6), // 60% to WHALES stakers
    dailyProtocolRevenue: dailyFees.clone(0.4), // 40% protocol side
  };
};

// ---------- SOLANA ----------
const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await getSolanaReceived({
    options,
    targets: contracts[CHAIN.SOLANA],
    balances: dailyFees,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyHoldersRevenue: dailyFees.clone(0.6),
    dailyProtocolRevenue: dailyFees.clone(0.4),
  };
};

// ---------- ADAPTER ----------
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: 1704067200, // Jan 1, 2024
    },
    [CHAIN.ETHEREUM]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.ARBITRUM]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.MERLIN]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.MANTA]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.BLAST]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.BASE]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.BSC]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.LINEA]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.MODE]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.OPTIMISM]: { fetch: fetchEVM, start: 1704067200 },
    [CHAIN.SCROLL]: { fetch: fetchEVM, start: 1704067200 },
  },
  meta: {
    methodology: {
      Fees:
        "Fees are calculated by tracking all tokens received by Whales Market settlement and fee-collector contracts across supported chains. These contracts only receive protocol fees from trading activity.",
      Revenue:
        "100% of collected fees. 60% distributed to $WHALES stakers, 20% allocated to development, 10% for buyback and burn, and 10% distributed to $LOOT stakers.",
      HoldersRevenue:
        "60% of total fees distributed to $WHALES stakers via xWHALES rewards.",
      ProtocolRevenue:
        "40% of total fees allocated to protocol operations, buybacks, and $LOOT incentives.",
    },
  },
};

export default adapter;
