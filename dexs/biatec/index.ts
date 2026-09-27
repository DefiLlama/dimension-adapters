import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL"
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// AVM Trade Reporter (Biatec's own indexer). Endpoint accepts an arbitrary [timestamp, to) window
// (added specifically for this adapter, see https://github.com/scholtz/AVMTradeReporter/pull/19),
// so it can be pulled hourly instead of only as a fixed daily snapshot.
const URL = "https://api.algorand.scan.biatec.io/api/Stats/dex"

interface IAPIResponse {
  volumeUSD: number;
};

const fetch = async (options: FetchOptions) => {
  const from = new Date(options.startTimestamp * 1000).toISOString();
  const to = new Date(options.endTimestamp * 1000).toISOString();
  const response: IAPIResponse = await fetchURLAutoHandleRateLimit(`${URL}?dex=Biatec&timestamp=${from}&to=${to}`);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(response.volumeUSD);

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ALGORAND],
  start: '2026-01-01',
  pullHourly: true,
  methodology: {
    Volume: "Total USD value of confirmed swaps on Biatec's Algorand pools, from Biatec's own trade indexer (AVM Trade Reporter).",
  },
};

export default adapter;
