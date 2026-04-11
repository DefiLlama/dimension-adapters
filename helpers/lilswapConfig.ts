import { CHAIN } from "./chains";
import { ChainAliasMap } from "./lilswap";

/**
 * Canonical list of chains supported by the LilSwap adapters.
 */
export const lilswapSupportedChains = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.BASE,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  CHAIN.OPTIMISM,
  CHAIN.XDAI,
  CHAIN.SONIC,
] as const;

/**
 * Maps DefiLlama chain identifiers to LilSwap API chain identifiers.
 */
export const lilswapChainAliases: ChainAliasMap = {
  [CHAIN.ETHEREUM]: "ethereum",
  [CHAIN.BSC]: "bnb",
  [CHAIN.POLYGON]: "polygon",
  [CHAIN.BASE]: "base",
  [CHAIN.ARBITRUM]: "arbitrum",
  [CHAIN.AVAX]: "avalanche",
  [CHAIN.OPTIMISM]: "optimism",
  [CHAIN.XDAI]: "gnosis",
  [CHAIN.SONIC]: "sonic",
};
