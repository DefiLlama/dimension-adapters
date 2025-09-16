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
  console.log(url);
  const entry = resp.data?.data?.[0];
  if (!entry) {
    throw new Error(`No Alkimi revenue data found for ${day}`);

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
      start: 1704067200, // Alkimi's actual fees start date (01/01/2024)
    },
  },
};
