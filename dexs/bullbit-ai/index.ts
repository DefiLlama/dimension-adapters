import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchData = async (options: FetchOptions) => {
  const from = options.startTimestamp;
  const to = options.endTimestamp;

  const res = await globalThis.fetch(
    `https://beta.bullbit.ai/services/one/v1/info/trading-data?from=${from}&to=${to}`
  );

  const data = await res.json();

  if (!data || data.length === 0) {
    return {
      dailyVolume: 0,
      dailyFees: 0,
      dailyRevenue: 0,
    };
  }

  let dailyVolume = 0;
  let dailyFees = 0;

  for (const day of data) {
    dailyVolume += day.totalVolume || 0;
    dailyFees += day.totalFee || 0;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.BASE],
  fetch: fetchData,
  start: "2026-01-01",
  methodology: {
    Volume:
      "Volume and Fees are sourced via Bullbit's official API, representing executed trades on the Execute engine and settled on-chain.",
    Revenue: "All fees collected by the protocol.",
  },
};

export default adapter;