import request from "graphql-request";
import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { config as symmioConfig } from "../helpers/symmio";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

type DailyHistory = {
  openInterest: string
}

type DailySolver = {
  openInterest: string
}

const start = '2025-09-30'

const dailyHistoriesQuery = `
  query ($day: String!) {
    dailyHistories(where: { day: $day }) {
      openInterest
    }
  }
`

const solverDailyHistoriesQuery = `
  query ($day: String!) {
    solverDailyHistories(where: { day: $day }) {
      openInterest
    }
  }
`

const fetch = async ({ chain, toTimestamp }: FetchOptions) => {
  const endpoint = symmioConfig[chain];
  if (!endpoint) return {};

  const startOfDay = getTimestampAtStartOfDayUTC(toTimestamp);
  const day = String(Math.floor(startOfDay / 86400));
  const { dailyHistories = [] } = await request(endpoint, dailyHistoriesQuery, { day })
    .catch((error) => {
      console.error(`Symmio open interest daily histories graph request failed on ${chain} (${endpoint})`, error)
      return { dailyHistories: [] };
    }) as { dailyHistories: DailyHistory[] };
  const { solverDailyHistories = [] } = await request(endpoint, solverDailyHistoriesQuery, { day })
    .catch((error) => {
      console.error(`Symmio open interest solver daily histories graph request failed on ${chain} (${endpoint})`, error)
      return { solverDailyHistories: [] };
    }) as { solverDailyHistories: DailySolver[] };

  let openInterestAtEnd = 0;

  dailyHistories.forEach(({ openInterest }) => {
    openInterestAtEnd += Number(openInterest) / 1e18;
  });

  solverDailyHistories.forEach(({ openInterest }) => {
    openInterestAtEnd += Number(openInterest) / 1e18;
  });

  return {
    openInterestAtEnd: openInterestAtEnd.toString(),
  };
}

const adapter: Adapter = {
  version: 1,
  adapter: Object.fromEntries(Object.keys(symmioConfig).map((chain) => [chain, { fetch, start }])),
  start,
};

export default adapter;
