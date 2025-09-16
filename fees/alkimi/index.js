const axios = require("axios");

function getUniqStartOfTodayTimestamp(date) {
  return Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000);
}

const fetch = async (timestamp) => {
  const date = new Date(timestamp * 1000);
  const day = date.toISOString().split("T")[0];

  // Request revenue for exactly this day
  const url = `https://api.alkimi.org/api/v1/public/data?startDate=${day}&endDate=${day}`;
  const resp = await axios.get(url);

  const entry = resp.data?.data?.[0];
  if (!entry) {
    return {
      timestamp: getUniqStartOfTodayTimestamp(date),
      dailyFees: "0",
      dailyRevenue: "0",
      dailyHoldersRevenue: "0",
      dailyProtocolRevenue: "0",
    };
  }

  const revenueUsd = parseFloat(entry.alkimi_revenue || "0");

  return {
    timestamp: getUniqStartOfTodayTimestamp(date),
    dailyFees: revenueUsd.toString(),
    dailyRevenue: revenueUsd.toString(),
    dailyHoldersRevenue: revenueUsd.toString(),
    dailyProtocolRevenue: "0",
  };
};

module.exports = {
  adapter: {
    general: {
      fetch,
      start: 1723507200, // replace with Alkimi's actual fees start date (UTC midnight)
    },
  },
};
