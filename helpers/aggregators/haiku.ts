import { Chain } from "../../adapters/types";
import { CHAIN } from "../chains";

type IContract = {
  [c: string | Chain]: {
    id: string;
    startTime: string;
  };
};

export const HaikuAddreses: IContract = {
  [CHAIN.ETHEREUM]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    startTime: "2025-05-19",
  },
  [CHAIN.BASE]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    startTime: "2025-05-19",
  },
  [CHAIN.ARBITRUM]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    startTime: "2025-05-19",
  },
  [CHAIN.SONIC]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    startTime: "2025-05-19",
  },
  [CHAIN.BERACHAIN]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    startTime: "2025-05-19",
  },
  [CHAIN.BSC]: {
    id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
    startTime: "2025-05-19",
  },
  // [CHAIN.HYPERLIQUID]: {
  //   id: "0x24aC999FF132B32c5b3956973b6213B0d07eB2C7",
  //   startTime: "2025-06-24",
  // },
};
