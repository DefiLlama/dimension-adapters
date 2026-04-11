import { CHAIN } from "./chains";
import { ChainAliasMap } from "./lilswap";

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
