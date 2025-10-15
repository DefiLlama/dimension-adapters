import { Chain } from "../../adapters/types";
import { CHAIN } from "../chains";

type IContract = {
  [c: string | Chain]: {
    id: string;
    start: string;
  };
};

export const HaikuChainConfig: IContract = {
  [CHAIN.ETHEREUM]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-05-19",
  },
  [CHAIN.BASE]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-05-19",
  },
  [CHAIN.ARBITRUM]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-05-19",
  },
  [CHAIN.SONIC]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-05-19",
  },
  [CHAIN.BERACHAIN]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-05-19",
  },
  [CHAIN.BSC]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-05-19",
  },
  [CHAIN.HYPERLIQUID]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-06-24",
  },
  [CHAIN.POLYGON]: {
    id: "0x2d1f05273292378A8CE938628dA7D8bDbCA4D9FF",
    start: "2025-09-01",
  },
  [CHAIN.OPTIMISM]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
  [CHAIN.UNICHAIN]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
  [CHAIN.SEI]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
  [CHAIN.AVAX]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
  [CHAIN.SCROLL]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
  [CHAIN.KATANA]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
  [CHAIN.APECHAIN]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
  [CHAIN.XDAI]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
  [CHAIN.WC]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    start: "2025-09-01",
  },
};

export const mappingChainToDuneChain = (chain: Chain): string => {
  switch (chain) {
    case CHAIN.BSC:
      return "bnb";
    case CHAIN.AVAX:
      return "avalanche_c";
    case CHAIN.XDAI:
      return "gnosis";
    case CHAIN.WC:
      return "worldchain";
    case CHAIN.HYPERLIQUID:
      return "hyperevm";
    default:
      return chain;
  }
};
