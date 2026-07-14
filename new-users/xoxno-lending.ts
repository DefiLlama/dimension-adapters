import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const API_BASE = "https://api.xoxno.com";
const HEADERS = { "User-Agent": "dune-analytics" };
const REQUEST_TIMEOUT_MS = 5_000;

type ChainConfig = {
  chainName: string;
  userStatsExportPath: string;
  start: string;
};

type UserStatsExport = {
  activeUsers?: number;
  newUsers?: number;
  activeAccounts?: number;
  transactions?: number;
};

const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  [CHAIN.STELLAR]: {
    chainName: "Stellar",
    userStatsExportPath: "/integrations/lending/stellar/active-users",
    start: "2026-06-21",
  },

  // Add MultiversX later with the same API response shape:
  // [CHAIN.MULTIVERSX]: {
  //   chainName: "MultiversX",
  //   userStatsExportPath: "/integrations/lending/multiversx/active-users",
  //   start: "YYYY-MM-DD",
  // },
};

function dayRange(timestamp: number) {
  const day = new Date(timestamp * 1000);
  day.setUTCHours(0, 0, 0, 0);

  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);

  return {
    startTime: day.toISOString().slice(0, 10),
    endTime: next.toISOString().slice(0, 10),
  };
}

async function fetchUserStats(options: FetchOptions): Promise<UserStatsExport> {
  const { startTime, endTime } = dayRange(options.startTimestamp);
  const path = CHAIN_CONFIGS[options.chain].userStatsExportPath;
  const url = `${API_BASE}${path}?startTime=${startTime}&endTime=${endTime}`;
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `XOXNO lending user-stats export failed: ${response.status}`,
    );
  }

  return (await response.json()) as UserStatsExport;
}

async function fetchNewUsers(options: FetchOptions) {
  const stats = await fetchUserStats(options);

  // New owners = wallets whose first-ever lending action (global minimum)
  // falls in the day. Counted by owner wallet, not sub-account.
  return {
    dailyNewUsers: Number(stats.newUsers ?? 0),
  };
}

const methodology = {
  NewUsers:
    "Distinct owner wallet addresses whose first-ever XOXNO lending action falls in the day, from the on-chain position activity feed. Sub-accounts of the same wallet are collapsed to one user.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch: fetchNewUsers,
  adapter: Object.fromEntries(
    Object.entries(CHAIN_CONFIGS).map(([chain, config]) => [
      chain,
      { start: config.start },
    ]),
  ),
  methodology,
};

export default adapter;
