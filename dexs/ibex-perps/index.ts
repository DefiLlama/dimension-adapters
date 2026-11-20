import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";

const API_BASE = "https://api.cctools.network/api/markets/ibex/derivatives";

const fetch = async (options: FetchOptions) => {
  const url = `${API_BASE}?date=${options.dateString}`;
  const data = await fetchURL(url);
  const dailyVolume = data.data.reduce(
    (sum: number, m: any) => sum + m.dailyVolumeUsd,
    0
  );
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    "canton": {
      fetch,
      start: "2026-10-27",
    },
  },
  methodology: {
    Volume:
      "Daily trading volume across all perpetual futures markets (BTC-PERP, ETH-PERP, CC-PERP) on Ibex Market, denominated in USDCx (1:1 USD). Sourced via CCTools which republishes Ibex's own API.",
  },
};

export default adapter;
