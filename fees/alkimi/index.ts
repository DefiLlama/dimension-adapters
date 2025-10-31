import { FetchOptions } from "../../adapters/types";

const axios = require("axios");
const { CHAIN } = require("../../helpers/chains");

const fetch = async (_: any, _1: any, { dateString }: FetchOptions) => {
  const url = `https://api.alkimi.org/api/v1/public/data?startDate=${dateString}&endDate=${dateString}`;
  const resp = await axios.get(url);
  const entry = resp.data?.data?.[0];
  if (!entry)
    throw new Error(`No Alkimi revenue data found for ${dateString}`);

  const revenueUsd = parseFloat(entry.alkimi_revenue || "0");

  return {
    dailyFees: revenueUsd,
    dailyRevenue: revenueUsd,
    dailyHoldersRevenue: revenueUsd,
    dailyProtocolRevenue: "0",
  };
};

export default {
  methodology: {
    Fees: "Transaction fees paid",
    HoldersRevenue: "All fees are used to buy back alkimi tokens and distributed to stakers",
  },
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2024-01-01',
    },
  },
};
