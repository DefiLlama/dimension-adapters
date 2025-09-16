const axios = require("axios");

function getUniqStartOfTodayTimestamp(date) {
  return Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000);
}

const fetch = async (timestamp) => {
  const date = new Date(timestamp * 1000);

  // fetch last 30 days so we always have data
  const start = new Date(timestamp * 1000 - 86400 * 30 * 1000).toISOString().split("T")[0];
  const end = date.toISOString().split("T")[0];

  const url = `https://api.alkimi.org/api/v1/public/data?startDate=${start}&endDate=${end}`;
  console.log("URL : ", url);
  const resp = await axios.get(url);

  const records = resp.data?.data;
  if (!records || records.length === 0) {
    return {
      timestamp: getUniqStartOfTodayTimestamp(date),
      dailyFees: "0",
      dailyRevenue: "0",
      dailyHoldersRevenue: "0",
      dailyProtocolRevenue: "0",
    };
  }

  // pick the most recent day available
  const entry = records[records.length - 1];
  const revenueUsd = parseFloat(entry.alkimi_revenue || "0");

  return {
    timestamp: getUniqStartOfTodayTimestamp(new Date(entry.date)),
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
      start: 1723507200, // replace with Alkimi fees start date (UTC midnight)
    },
  },
