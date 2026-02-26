import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const HL_BUILDER_ADDRESS = "0xb5d19a1f92fcd5bfdd154d16793bb394f246cb36";
const EXTENDED_BUILDER_NAMES = ['FlowBot'];
const EXTENDED_BUILDER_FEE_RATE = 0.00001;

const fetchHyperliquid = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue } =
    await fetchBuilderCodeRevenue({
      options,
      builder_address: HL_BUILDER_ADDRESS,
    });
  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const fetchExtended = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees } =
    await fetchBuilderData({
      options,
      builderNames: EXTENDED_BUILDER_NAMES,
      builderFeeRate: EXTENDED_BUILDER_FEE_RATE
    });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Trading fees paid by users for perps in FlowBot perps trading bot.",
  Revenue: "Fees collected by FlowBot as Builder Revenue from Hyperliquid and Extended Exchange.",
  ProtocolRevenue: "Fees collected by FlowBot as Builder Revenue from Hyperliquid and Extended Exchange.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-11-27",
    },
    [CHAIN.STARKNET]: {
      fetch: fetchExtended,
      start: "2026-01-26",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
