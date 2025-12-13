import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";


type DailyFeesRow = {
  day: string;
  currency_name: string;      // e.g. "ETH", "BTC"
  instrument_type: string;    // e.g. "OPTION", "PERP", "SPOT"
  makerRebates: number;
  takerRebates: number;
  makerFees: number;
  takerFees: number;
};

const FEES_ENDPOINT = "https://stats-api.derive.xyz/fees";

const fetch = async (options: FetchOptions) => {
  const durationSeconds = Math.max(0, options.endTimestamp - options.startTimestamp);
  const endTimeIso = new Date(options.endTimestamp * 1000).toISOString();

  const url =
    `${FEES_ENDPOINT}` +
    `?market=all` +
    `&instrument=all` +
    `&view=daily` +
    `&duration=${durationSeconds}` +
    `&endTime=${encodeURIComponent(endTimeIso)}`;

  const rows = (await httpGet(url)) as DailyFeesRow[];

  let grossFeesUsd = 0;

  for (const r of rows) {
    grossFeesUsd += (Number(r.makerFees) || 0) + (Number(r.takerFees) || 0);
  }

  // All metrics are equal to gross fees (no rebates subtracted)
  const dailyFees = grossFeesUsd;
  const dailyRevenue = grossFeesUsd;
  const dailyUserFees = grossFeesUsd;
  const dailyProtocolRevenue = grossFeesUsd;

  return {
    dailyFees,
    dailyRevenue,
    dailyUserFees,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Gross trading fees charged to users across Derive markets (makerFees + takerFees) from stats-api.derive.xyz/fees over the requested period.",
  Revenue: "Equal to Fees (gross trading fees without subtracting rebates).",
  UserFees: "Equal to Fees (fees paid by traders).",
  ProtocolRevenue: "Equal to Fees (gross trading fees without subtracting rebates).",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.LYRA],
  start: "2023-11-01",
  methodology,
};

export default adapter;
