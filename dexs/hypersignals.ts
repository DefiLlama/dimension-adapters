import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const HL_BUILDER_ADDRESS = "0x8af3545a3988b7a46f96f9f1ae40c0e64fa493c2";
const EXTENDED_BUILDER_NAME = "0x8af3545a3988b7a46f96f9f1ae40c0e64fa493c2";

// https://biconomy.gitbook.io/hypersignals/terminal-trading-manual#fees-manual-trading
const EXTENDED_BUILDER_FEE_RATE = 0.0001;

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
  Fees: "Trading fees paid by users for perps in HyperSignals perps trading terminal.",
  Revenue: "Fees collected by HyperSignals as Builder Revenue from Hyperliquid and Extended Exchange.",
  ProtocolRevenue: "Fees collected by HyperSignals as Builder Revenue from Hyperliquid and Extended Exchange.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchHyperliquid,
      start: "2025-07-29",
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
