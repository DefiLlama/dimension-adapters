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
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Trading fees include 0.05% for correlated pairs and 0.25% for non-correlated pairs, plus automation fees for TP/SL orders and flash loan fees.",
  Revenue: "Revenue consists of the service fees collected from trades on both correlated and non-correlated pairs.",
  ProtocolRevenue: "Protocol revenue is 0 as all fees go to stakers.",
  HoldersRevenue: "Holders revenue represents 100% of the trading fees which are distributed to stakers.",
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
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
