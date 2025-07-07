import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: "0xFee97c6f9Bce786A08b1252eAc9223057508c760",
    fromAdddesses: ["0x3F37C7d8e61C000085AAc0515775b06A3412F36b"],
  });
  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.SCROLL]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.XDAI]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.AVAX]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.LINEA]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2024-11-05",
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2024-11-05",
    },
  },
};

export default adapter;
