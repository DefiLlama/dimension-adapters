import fetchURL from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const thalaDappURL = "https://app.echelon.market";
const feesQueryURL = `${thalaDappURL}/api/defillama/fees?timeframe=`;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const feesEndpoint = (
  endTimestamp: number,
  timeframe: string,
  network: string
) =>
  endTimestamp
    ? feesQueryURL +
      timeframe +
      `&endTimestamp=${endTimestamp}&network=${network}`
    : feesQueryURL + timeframe + `&network=${network}`;

const fetch = async (timestamp: number, network: string) => {
  const dayFeesQuery = (await fetchURL(feesEndpoint(timestamp, "1D", network)))
    ?.data;
  const dailyFees = dayFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const totalFeesQuery = (await fetchURL(feesEndpoint(0, "ALL", network)))
    ?.data;
  const totalFees = totalFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  return {
    totalFees: `${totalFees}`,
    dailyFees: `${dailyFees}`,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: (timestamp: number) => fetch(timestamp, "aptos_mainnet"),
      start: "2023-04-03",
    },
    [CHAIN.MOVE]: {
      fetch: (timestamp: number) => fetch(timestamp, "movement_mainnet"),
      start: "2025-03-09",
    },
  },
};

export default adapter;
