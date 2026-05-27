import { CHAIN } from "../helpers/chains";
import { fetchBuilderCodeRevenue } from "../helpers/hyperliquid";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";

const HL_BUILDER_ADDRESS = "0x5eb46BFBF7C6004b59D67E56749e89e83c2CaF82";
const EXTENDED_BUILDER_NAMES = [
  '0x5eb46bfbf7c6004b59d67e56749e89e83c2caf82',
  'Miracle',
];

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

const fetchNado = async (_a: any, _b: any, _options: FetchOptions) => {
  const response = await httpGet('https://incentives.miracletrade.com/v2/metrics?dex=nado', {
    headers: {
      'X-Api-Key': getEnv('MIRACLETRADE_API_KEY'),
    }
  })
  
  const volume = response.data.volume || 0;
  const grossRevenue = response.data.grossRevenue || 0;
  
  return {
    dailyVolume: volume,
    dailyFees: grossRevenue,
    dailyRevenue: grossRevenue,
    dailyProtocolRevenue: grossRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by users for perps in Miracle perps trading terminal.",
  Revenue: "Fees collected by Miracle as Builder Revenue from Hyperliquid, Extended, and Nado Exchange.",
  ProtocolRevenue: "Fees collected by Miracle as Builder Revenue from Hyperliquid, Extended, and Nado Exchange.",
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
    [CHAIN.INK]: {
      fetch: fetchNado,
      start: "2026-03-23",
      runAtCurrTime: true,
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
