import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const HL_BUILDER_ADDRESS = "0x5eb46BFBF7C6004b59D67E56749e89e83c2CaF82";
const EXTENDED_BUILDER_NAME = "0x5eb46bfbf7c6004b59d67e56749e89e83c2caf82";

// https://docs.miracletrade.com/integrations-and-fees
const EXTENDED_BUILDER_FEE_RATE = 0.00035;

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
      builderName: EXTENDED_BUILDER_NAME,
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
  Fees: "Trading fees paid by users for perps in Miracle perps trading terminal.",
  Revenue: "Fees collected by Miracle as Builder Revenue from Hyperliquid and Extended Exchange.",
  ProtocolRevenue: "Fees collected by Miracle as Builder Revenue from Hyperliquid and Extended Exchange.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-09-11",
    },
    [CHAIN.STARKNET]: {
      fetch: fetchExtended,
      start: "2026-01-28",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
