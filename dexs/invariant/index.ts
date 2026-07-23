import { SimpleAdapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";
const solanaStatsApiEndpoint =
  "https://stats.invariant.app/solana/intervals/solana-mainnet?interval=daily";
const eclipseStatsApiEndpoint =
  "https://stats.invariant.app/eclipse/intervals/eclipse-mainnet?interval=daily";

// create pool hardcodes protocol_fee onchain
const PROTOCOL_FEE_RATIO = 0.01;

type StatsApiResponse = {
  data: {
    volume24: { value: number; };
    fees24: { value: number; };
  };
};

const fetch = async (fullSnapEndpoint: string): Promise<FetchResult> => {
  const fullSnapResponse = await axios.get<any, StatsApiResponse>(
    fullSnapEndpoint
  );
  const dailyFees = fullSnapResponse.data.fees24.value;
  return {
    dailyVolume: fullSnapResponse.data.volume24.value,
    dailyFees,
    dailySupplySideRevenue: dailyFees * (1 - PROTOCOL_FEE_RATIO),
    dailyRevenue: dailyFees * PROTOCOL_FEE_RATIO,
    dailyProtocolRevenue: dailyFees * PROTOCOL_FEE_RATIO,
  };
};

const fetchSolana = async (_options: FetchOptions) => {
  return fetch(solanaStatsApiEndpoint);
};

const fetchEclipse = async (_options: FetchOptions) => {
  return fetch(eclipseStatsApiEndpoint);
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
