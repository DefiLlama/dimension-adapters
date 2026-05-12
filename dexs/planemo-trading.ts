import { CHAIN } from "../helpers/chains";
import { fetchBuilderData } from "../helpers/extended-exchange";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const EXTENDED_BUILDER_NAMES = ["Planemo Trading"];

const fetchExtended = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyFees } = await fetchBuilderData({
    options,
    builderNames: EXTENDED_BUILDER_NAMES,
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Trading fees paid by users for perps in Planemo Trading terminal on Extended.",
  Revenue: "Fees collected by Planemo Trading as builder revenue from Extended.",
  ProtocolRevenue: "Fees collected by Planemo Trading as builder revenue from Extended.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetchExtended,
      start: "2026-04-12",
    },
  },
  methodology,
  doublecounted: true,
};

export default adapter;
