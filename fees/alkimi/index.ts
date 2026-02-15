import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

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

const methodology = {
  Fees: "Transaction fees paid by advertisers on the Alkimi ad exchange",
  HoldersRevenue: "All fees are used to buy back alkimi tokens and distributed to stakers",
};

const breakdownMethodology = {
  Fees: {
    "Ad exchange fees": "Transaction fees paid by advertisers using the Alkimi ad exchange platform",
  },
  Revenue: {
    "Ad exchange fees": "All transaction fees collected from advertisers, allocated entirely to token holders",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "100% of ad exchange fees used to buy back ALKIMI tokens and distribute to stakers",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2024-01-01',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
