import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const getUniV2LogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 0.32,
  protocolRevenueRatio: 0.32,
}

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "All fees comes from the user.",
    UserFees: "User pays 0.25% fees on each swap.",
    SupplySideRevenue: "LPs receive 0.17% of each swap.",
    Revenue: "Treasury receives 0.08% of each swap.",
    ProtocolRevenue: "Treasury receives 0.08% of each swap.",
  },
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV2LogAdapter({ factory: '0x591f122d1df761e616c13d265006fcbf4c6d6551', ...getUniV2LogAdapterConfig }),
    },
    [CHAIN.OPTIMISM]: {
      fetch: getUniV2LogAdapter({ factory: '0xaedc38bd52b0380b2af4980948925734fd54fbf4', ...getUniV2LogAdapterConfig }),
    },
    [CHAIN.ARBITRUM]: {
      fetch: getUniV2LogAdapter({ factory: '0x507940c2469e6e3b33032f1d4ff8d123bdde2f5c', ...getUniV2LogAdapterConfig }),
    },
    [CHAIN.BLAST]: {
      fetch: getUniV2LogAdapter({ factory: '0xf5190e64db4cbf7ee5e72b55cc5b2297e20264c2', ...getUniV2LogAdapterConfig }),
    },
    [CHAIN.MODE]: {
      fetch: getUniV2LogAdapter({ factory: '0x757cd583004400ee67e5cc3c7a60c6a62e3f6d30', ...getUniV2LogAdapterConfig }),
    },
    // [CHAIN.XLAYER]: {
    //   fetch: getUniV2LogAdapter({ factory: '0x757cd583004400ee67e5cc3c7a60c6a62e3f6d30', ...getUniV2LogAdapterConfig }),
    // },
    [CHAIN.LINEA]: {
      fetch: getUniV2LogAdapter({ factory: '0x9790713770039cefcf4faaf076e2846c9b7a4630', ...getUniV2LogAdapterConfig }),
    },
  }
};

export default adapter;
