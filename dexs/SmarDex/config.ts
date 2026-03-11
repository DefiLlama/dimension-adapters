import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import ADDRESSES from "../../helpers/coreAssets.json";

export const CONFIG = {
  SUBGRAPH: {
    API_KEY: getEnv("SMARDEX_SUBGRAPH_API_KEY"),
    GATEWAY: "https://subgraph.smardex.io/defillama",
  },
  TOKENS: {
    USDN: "0xde17a000ba631c5d7c2bd9fb692efea52d90dee2",
    WSTETH: ADDRESSES.ethereum.WSTETH,
  },
  CONTRACTS: {
    USDN: "0x656cb8c6d154aad29d8771384089be5b5141f01a",
    DIP_ACCUMULATOR: "0xaebcc85a5594e687f6b302405e6e92d616826e03",
  },
};

export const CHAIN_CONFIG = {
  GRAPH_URLS: {
    [CHAIN.ARBITRUM]: `${CONFIG.SUBGRAPH.GATEWAY}/arbitrum`,
    [CHAIN.BASE]: `${CONFIG.SUBGRAPH.GATEWAY}/base`,
    [CHAIN.BSC]: `${CONFIG.SUBGRAPH.GATEWAY}/bsc`,
    [CHAIN.ETHEREUM]: `${CONFIG.SUBGRAPH.GATEWAY}/ethereum`,
    [CHAIN.POLYGON]: `${CONFIG.SUBGRAPH.GATEWAY}/polygon`,
  },
  START_TIMES: {
    [CHAIN.ARBITRUM]: 1689582249,
    [CHAIN.BASE]: 1691491872,
    [CHAIN.BSC]: 1689581494,
    [CHAIN.ETHEREUM]: 1678404995,
    [CHAIN.POLYGON]: 1689582144,
  },
};

export function getGraphHeaders() {
  const defaultHeaders = {
    "x-api-key": CONFIG.SUBGRAPH.API_KEY,
  };

  return Object.keys(CHAIN_CONFIG.GRAPH_URLS).reduce(
    (acc, chain) => ({ ...acc, [chain]: defaultHeaders }),
    {}
  );
}
