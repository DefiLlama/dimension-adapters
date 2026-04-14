import { FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";
import { httpGet } from "../utils/fetchURL";

export async function getDeriveBuilderData(builderName: string, fromTime: number, toTime: number) {
  const response = await httpGet(`https://api.lyra.finance/public/get_referral_performance?start_ms=${fromTime * 1000}&end_ms=${toTime * 1000}&referral_code=${builderName}`)
  
  const volume = response.result.total_notional_volume || 0;
  const fees = response.result.total_referred_fees || 0 + response.result.total_fee_rewards || 0;
  
  return { volume, fees }
}

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

const fetch = (instrument: string) => async (_: any, _1: any, options: FetchOptions) => {
  const durationSeconds = Math.max(0, options.endTimestamp - options.startTimestamp);
  const endTimeIso = new Date(options.endTimestamp * 1000).toISOString();

  const url =
    `${FEES_ENDPOINT}` +
    `?market=all` +
    `&instrument=${instrument}` +
    `&view=daily` +
    `&duration=${durationSeconds}` +
    `&endTime=${encodeURIComponent(endTimeIso)}`;

  const rows = (await httpGet(url, { headers: { 'Authorization': `Bearer ${getEnv('DERIVE_API_KEY')}` }})) as DailyFeesRow[];

  if (!rows || rows.length === 0)
    throw new Error(`No data returned from Derive fees endpoint for url: ${url}`);


  let grossFeesUsd = 0;
  let grossRevenueUsd = 0;

  for (const r of rows) {
    grossFeesUsd += (Number(r.makerFees) || 0) + (Number(r.takerFees) || 0);
    grossRevenueUsd += (Number(r.makerFees) || 0) + (Number(r.takerFees) || 0) - (Number(r.makerRebates) || 0) - (Number(r.takerRebates) || 0);
  }

  // All metrics are equal to gross fees (no rebates subtracted)
  const dailyFees = grossFeesUsd;
  const dailyRevenue = grossRevenueUsd;
  const dailyUserFees = grossFeesUsd;
  const dailyProtocolRevenue = grossRevenueUsd;

  return {
    dailyFees,
    dailyRevenue,
    dailyUserFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "Gross trading fees charged to users across Derive markets (makerFees + takerFees) from stats-api.derive.xyz/fees over the requested period.",
  Revenue: "Equal to Fees (gross trading fees subtracting rebates).",
  UserFees: "Equal to Fees (fees paid by traders).",
  ProtocolRevenue: "Equal to Fees (gross trading fees subtracting rebates).",
};

export const getLyraAdapter = (instrument: string): any => ({
  version: 1,
  fetch: fetch(instrument),
  chains: [CHAIN.LYRA],
  start: "2023-11-01",
  methodology,
})

export default getLyraAdapter('perp')
