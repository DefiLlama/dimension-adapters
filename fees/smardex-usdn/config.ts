import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

export const CONFIG = {
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
  START_TIME: {
    [CHAIN.ETHEREUM]: 1737570539,
  },
};
