import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const HL_BUILDER_ADDRESS = "0x49ae63056b3a0be0b166813ee687309ab653c07c";
const EXTENDED_BUILDER_NAMES = ['DextraBot'];

// https://docs.dextrabot.com/dextrabot/fees#quick-overview
const EXTENDED_BUILDER_FEE_RATE = 0.0002;

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
  Fees: "Trading fees paid by users for perps in Dextra Bot.",
  Revenue: "Fees collected by Dextra Bot as Builder Revenue from Hyperliquid and Extended Exchange.",
  ProtocolRevenue: "Fees collected by Dextra Bot as Builder Revenue from Hyperliquid and Extended Exchange.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-02-16",
    },
    [CHAIN.STARKNET]: {
      fetch: fetchExtended,
      start: "2025-01-26",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
