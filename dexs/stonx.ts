import PromisePool from "@supercharge/promise-pool";
import { Adapter, FetchOptions } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet } from "../utils/fetchURL";

const API = "https://prod-api.ekubo.org";
const CHAIN_ID = "4663";
// Deployed STONX Ve33 extension on Robinhood Chain.
// https://docs.ekubo.org/products/ve33/
const VE33 = "0xD18685A514E59b06d59824e16Db07e73345d9953";
const PAGE_SIZE = 200;
const API_CONCURRENCY = 8;
const VOTER_FEES = "Swap Fees To veSTONX Voters";

interface Ve33Pool {
  pool_id: string;
  token0: string;
  token1: string;
  core_address: string;
}

interface Ve33PoolsResponse {
  data: Ve33Pool[];
  pagination: {
    totalPages: number;
  };
}

interface DailyPoolMetric {
  token: string;
  volume: string;
  fees: string;
  ve33_fees: string;
  date: string;
}

interface PoolVolumeResponse {
  volumeByTokenByDate: DailyPoolMetric[];
}

const poolsUrl = (page: number) =>
  `${API}/ve33/${VE33}/pools?chainId=${CHAIN_ID}&page=${page}&pageSize=${PAGE_SIZE}`;

const poolVolumeUrl = (pool: Ve33Pool) =>
  `${API}/pair/${CHAIN_ID}/${pool.token0}/${pool.token1}/volume?coreAddress=${pool.core_address}&poolId=${pool.pool_id}`;

function tokenIdToAddress(tokenId: string): string {
  const hex = BigInt(tokenId).toString(16);
  if (hex === "0") return ADDRESSES.null;
  return `0x${hex.padStart(40, "0")}`;
}

async function getVe33Pools(): Promise<Ve33Pool[]> {
  const firstPage: Ve33PoolsResponse = await httpGet(poolsUrl(1));
  const pools = [...firstPage.data];

  if (firstPage.pagination.totalPages <= 1) return pools;

  const remainingPages = Array.from(
    { length: firstPage.pagination.totalPages - 1 },
    (_, index) => index + 2,
  );
  const { results, errors } = await PromisePool.withConcurrency(API_CONCURRENCY)
    .for(remainingPages)
    .process((page) => httpGet(poolsUrl(page)) as Promise<Ve33PoolsResponse>);

  if (errors.length) throw errors[0];
  results.forEach((response) => pools.push(...response.data));
  return pools;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const pools = await getVe33Pools();

  const { results, errors } = await PromisePool.withConcurrency(API_CONCURRENCY)
    .for(pools)
    .process((pool) => httpGet(poolVolumeUrl(pool)) as Promise<PoolVolumeResponse>);

  if (errors.length) throw errors[0];

  results.forEach(({ volumeByTokenByDate }) => {
    volumeByTokenByDate
      .filter(({ date }) => date.slice(0, 10) === options.dateString)
      .forEach(({ token, volume, fees, ve33_fees }) => {
        if (BigInt(fees) !== BigInt(ve33_fees)) {
          throw new Error("STONX Ve33 swap fees no longer equal voter fees; update the revenue split");
        }

        const address = tokenIdToAddress(token);
        dailyVolume.add(address, volume);
        dailyFees.add(address, fees, METRIC.SWAP_FEES);
        dailyHoldersRevenue.add(address, ve33_fees, VOTER_FEES);
      });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: 0,
  };
};

const methodology = {
  Volume:
    "Input-token volume from swaps across every Ekubo Core pool configured with the deployed STONX Ve33 extension on Robinhood Chain. Only the input side of each swap is counted.",
  Fees: "Swap fees paid by traders across all STONX Ve33 pools.",
  UserFees: "Swap fees paid by traders across all STONX Ve33 pools.",
  Revenue:
    "All STONX Ve33 swap fees are routed to veSTONX voters. The protocol treasury takes no share.",
  HoldersRevenue:
    "All swap fees are allocated to veSTONX voters in proportion to the voting power assigned to each pool.",
  ProtocolRevenue: "Zero. The protocol treasury takes no share of STONX Ve33 swap fees.",
  SupplySideRevenue:
    "Zero. Liquidity providers receive STONX emissions rather than a share of swap fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders across STONX Ve33 pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders across STONX Ve33 pools.",
  },
  Revenue: {
    [VOTER_FEES]: "All swap fees routed to veSTONX voters.",
  },
  HoldersRevenue: {
    [VOTER_FEES]: "All swap fees routed to veSTONX voters.",
  },
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-30",
  doublecounted: true, // These swaps are already included in the broader Ekubo adapter.
  methodology,
  breakdownMethodology,
};

export default adapter;
