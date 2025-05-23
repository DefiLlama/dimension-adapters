import fetchURL from "../utils/fetchURL";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const thalaDappURL = "https://app.echelon.market";
const feesQueryURL = `${thalaDappURL}/api/defillama/fees?timeframe=`;

interface IVolumeall {
  value: number;
  timestamp: string;
}

const feesEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}`
    : feesQueryURL + timeframe;

const movementFeesEndpoint = (endTimestamp: number, timeframe: string) =>
  endTimestamp
    ? feesQueryURL + timeframe + `&endTimestamp=${endTimestamp}` + "&network=movement_mainnet"
    : feesQueryURL + timeframe + "&network=movement_mainnet";

const fetch = async (timestamp: number) => {
  const dayFeesQuery = (await fetchURL(feesEndpoint(timestamp, "1D")))?.data;
  const dailyFees = dayFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const totalFeesQuery = (await fetchURL(feesEndpoint(0, "ALL")))?.data;
  const totalFees = totalFeesQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  return {
    totalFees: totalFees,
    dailyFees: dailyFees,
  };
};


const fetchMovement = async (timestamp: number) => {

  const dayFeesMovementQuery = (await fetchURL(movementFeesEndpoint(timestamp, "1D")))?.data;
  const dailyMovementFees = dayFeesMovementQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  const totalFeesMovementQuery = (await fetchURL(movementFeesEndpoint(0, "ALL")))?.data;
  const totalMovementFees = totalFeesMovementQuery.reduce(
    (partialSum: number, a: IVolumeall) => partialSum + a.value,
    0
  );

  return {
    totalFees: totalMovementFees,
    dailyFees: dailyMovementFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2024-04-25',
    },
    [CHAIN.MOVE]: {
      fetch: fetchMovement,
      start: '2025-03-15',
    },
  },
};

export default adapter;
