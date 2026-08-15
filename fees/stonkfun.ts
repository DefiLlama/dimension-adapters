import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API = "https://www.stonkfun.xyz/api/public/v1/revenue/history";

type Day = {
  date: string;
  dailyRevenue: number;
  dailyHoldersRevenue: number;
  dailyProtocolRevenue: number;
};

let cache: Promise<Record<string, Day>> | undefined;

// full history in one payload, so it fetches once a day
function load(): Promise<Record<string, Day>> {
  if (!cache) {
    cache = httpGet(API)
      .then((body: any) => {
        // httpGet already unwraps axios, so `body` is the JSON: { data: { days }, meta }.
        const days: Day[] = body?.data?.days ?? [];
        if (!days.length) throw new Error("stonkfun: empty revenue history");
        return Object.fromEntries(days.map((d) => [d.date, d]));
      })
      .catch((e: any) => {
        cache = undefined;
        throw e;
      });
  }
  return cache;
}

const fetch = async (options: FetchOptions) => {
  const history = await load();
  const date = new Date(options.startTimestamp * 1000).toISOString().slice(0, 10);
  const day = history[date];
  if (!day) throw new Error(`stonkfun: no revenue data for ${date}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(day.dailyRevenue);
  dailyRevenue.addUSDValue(day.dailyRevenue);
  dailyProtocolRevenue.addUSDValue(day.dailyProtocolRevenue);
  dailyHoldersRevenue.addUSDValue(day.dailyHoldersRevenue);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "StonkFun's share of trading fees from the locked Raydium CLMM positions behind each launch.",
  Revenue: "StonkFun's Revenue, same as fees.",
  ProtocolRevenue: "Revenue left in the treasury after the STONK buyback.",
  HoldersRevenue: "Revenue spent buying STONK on the open market and burning it, at the amount actually spent.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-07-25",
  doublecounted: true, // Raydium may also report the same underlying CLMM swap fees.
  methodology,
};

export default adapter;
