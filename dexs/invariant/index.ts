import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
import { FetchResult } from "../../adapters/types";
const solanaStatsApiEndpoint =
  "https://stats.invariant.app/svm/full_snap/mainnet";
const eclipseStatsApiEndpoint =
  "https://stats.invariant.app/svm/full_snap/eclipse-mainnet";

type StatsApiResponse = {
  data: {
    volume24: { value: number; };
    fees24: { value: number; };
  };
};

const fetch = async (
  timestamp: number,
  fullSnapEndpoint: string
): Promise<FetchResult> => {
  const fullSnapResponse = await axios.get<any, StatsApiResponse>(
    fullSnapEndpoint
  );
  return {
    dailyVolume: fullSnapResponse.data.volume24.value,
    dailyFees: fullSnapResponse.data.fees24.value,
    timestamp,
  };
};

const fetchSolana = async (timestamp: number) => {
  return fetch(timestamp, solanaStatsApiEndpoint);
};

const fetchEclipse = async (timestamp: number) => {
  return fetch(timestamp, eclipseStatsApiEndpoint);
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      runAtCurrTime: true,
      start: "2022-03-22",
    },
    [CHAIN.ECLIPSE]: {
      fetch: fetchEclipse,
      runAtCurrTime: true,
      start: "2024-12-22",
    },
  },
};

export default adapter;
