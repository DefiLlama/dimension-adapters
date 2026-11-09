import retry from "async-retry";
import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API_URL = "https://api.pacifica.fi/api/v1/game/trades";
const HEADERS = { "User-Agent": "Mozilla/5.0", Origin: "https://app.pacifica.fi" };
const PAGE_SIZE = 1000; // Maximum page size supported by the API.
const LABEL = "Pacifica Options";

function decimal(value: unknown): BigNumber {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error("Pacifica Options: invalid trade amount");
  }
  return new BigNumber(value);
}

const fetch = async (options: FetchOptions) => {
  const start_time = options.startTimestamp * 1000;
  const end_time = options.endTimestamp * 1000;
  let cursor: string | undefined;
  let previousId = Number.MAX_SAFE_INTEGER;
  let premium = new BigNumber(0);
  let notional = new BigNumber(0);
  const cursors = new Set<string>();

  do {
    // Retry rate-limited requests during backfills.
    const response = await retry(() => httpGet(API_URL, {
      headers: HEADERS,
      params: { start_time, end_time, limit: PAGE_SIZE, cursor },
      timeout: 20_000,
    }), { retries: 3, minTimeout: 10_000, maxTimeout: 40_000, randomize: false });
    if (response.success !== true || !Array.isArray(response.data) || typeof response.has_more !== "boolean") {
      throw new Error("Pacifica Options: trades are unavailable");
    }

    for (const trade of response.data) {
      if (!Number.isSafeInteger(trade.history_id) || trade.history_id <= 0 || trade.history_id >= previousId
        || !Number.isSafeInteger(trade.created_at) || trade.created_at < start_time || trade.created_at >= end_time) {
        throw new Error("Pacifica Options: unordered, duplicate or out-of-window trade");
      }
      previousId = trade.history_id;
      if (typeof trade.symbol !== "string" || !trade.symbol) throw new Error("Pacifica Options: missing underlying");
      premium = premium.plus(decimal(trade.premium));
      // Trades without quantity contribute only to premium volume.
      if (trade.quantity === null) continue;
      const quantity = decimal(trade.quantity);
      const mark = decimal(trade.mark_price);
      if (!quantity.gt(0) || !mark.gt(0)) throw new Error("Pacifica Options: invalid opening price or quantity");
      notional = notional.plus(quantity.times(mark));
    }
    if (!response.has_more) break;
    if (!response.data.length || typeof response.next_cursor !== "string" || !response.next_cursor
      || cursors.has(response.next_cursor)) {
      throw new Error("Pacifica Options: incomplete or repeated pagination");
    }
    cursor = response.next_cursor;
    cursors.add(response.next_cursor);
  } while (true);

  const dailyPremiumVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  if (!Number.isFinite(premium.toNumber()) || !Number.isFinite(notional.toNumber())) {
    throw new Error("Pacifica Options: invalid volume");
  }
  dailyPremiumVolume.addUSDValue(premium.toNumber(), LABEL);
  dailyNotionalVolume.addUSDValue(notional.toNumber(), LABEL);
  return { dailyPremiumVolume, dailyNotionalVolume };
};

const methodology = {
  PremiumVolume: "Premium paid on options traded on Pacifica.",
  NotionalVolume: "Notional value of options traded on Pacifica, excluding trades with unavailable quantity.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-06-25",
  methodology,
  breakdownMethodology: {
    PremiumVolume: { [LABEL]: methodology.PremiumVolume },
    NotionalVolume: { [LABEL]: methodology.NotionalVolume },
  },
};

export default adapter;
