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
    timestamp: number;
    volume24: { value: number; };
    fees24: { value: number; };
  };
};

// the interval snapshot stamps the day it covers and used to advance daily,
// so anything older than two days is a stale snapshot rather than a fresh one
const MAX_SNAPSHOT_AGE = 2 * 24 * 60 * 60;

const fetch = async (
  fullSnapEndpoint: string,
  options: FetchOptions
): Promise<FetchResult> => {
  const fullSnapResponse = await axios.get<any, StatsApiResponse>(
    fullSnapEndpoint
  );

  const dailyVolume = Number(fullSnapResponse.data.volume24?.value);
  const dailyFees = Number(fullSnapResponse.data.fees24?.value);
  const snapshotTimestamp = Number(fullSnapResponse.data.timestamp);
  if (
    !Number.isFinite(dailyVolume) ||
    !Number.isFinite(dailyFees) ||
    !Number.isFinite(snapshotTimestamp)
  )
    throw new Error(
      `invariant: unreadable stats snapshot from ${fullSnapEndpoint}`
    );

  const snapshotAge = options.endTimestamp - snapshotTimestamp / 1000;
  if (snapshotAge > MAX_SNAPSHOT_AGE)
    throw new Error(
      `invariant: ${fullSnapEndpoint} last advanced ${Math.floor(snapshotAge / 86400)} days ago (timestamp ${new Date(snapshotTimestamp).toISOString()}), its 24h figures are not current`
    );

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue: dailyFees * (1 - PROTOCOL_FEE_RATIO),
    dailyRevenue: dailyFees * PROTOCOL_FEE_RATIO,
    dailyProtocolRevenue: dailyFees * PROTOCOL_FEE_RATIO,
  };
};

const fetchSolana = async (options: FetchOptions) => {
  return fetch(solanaStatsApiEndpoint, options);
};

const fetchEclipse = async (options: FetchOptions) => {
  return fetch(eclipseStatsApiEndpoint, options);
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
