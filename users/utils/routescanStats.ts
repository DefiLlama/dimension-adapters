import { PromisePool } from "@supercharge/promise-pool";
import { ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type ChainConfig = {
  chain: string;
  chainId: number;
  start: string;
};

type RouteScanRow = [string, string];

const BASE_URL = "https://cdn.routescan.io/api/evm/all/aggregations";

const routescanStatsChains: Record<string, ChainConfig> = {
  dfk: { chain: CHAIN.DFK, chainId: 53935, start: "2022-03-16" },
  dexalot: { chain: CHAIN.DEXALOT, chainId: 432204, start: "2022-12-04" },
  step: { chain: CHAIN.STEP, chainId: 1234, start: "2022-08-12" },
  numbers: { chain: CHAIN.NUMBERS, chainId: 10507, start: "2022-10-12" },
  metis: { chain: CHAIN.METIS, chainId: 1088, start: "2021-11-18" },
  chz: { chain: CHAIN.CHILIZ, chainId: 88888, start: "2023-02-08" },
  nibiru: { chain: CHAIN.NIBIRU, chainId: 6900, start: "2025-02-11" },
  btnx: { chain: CHAIN.BOTANIX, chainId: 3637, start: "2025-05-22" },
  beam: { chain: CHAIN.BEAM, chainId: 4337, start: "2023-08-14" },
};

async function fetchMetric(config: ChainConfig, metric: string, date: string) {
  const data = await fetchURL(`${BASE_URL}/${metric}?includedChainIds=${config.chainId}&unit=day`);
  if (!Array.isArray(data)) throw new Error(`Invalid Routescan ${metric} response for ${config.chain}`);
  const entry = (data as RouteScanRow[]).find(([timestamp]) => timestamp.startsWith(date));
  return Number(entry?.[1] ?? 0);
}

function getRoutescanUsers(config: ChainConfig) {
  return async (_start: number, end: number) => {
    const date = new Date((end - 1) * 1e3).toISOString().slice(0, 10);
    const { results, errors } = await PromisePool.withConcurrency(2)
      .for(["txs", "addresses"])
      .process(async (metric) => ({ metric, value: await fetchMetric(config, metric, date) }));

    if (errors.length) throw errors[0];

    const metrics = Object.fromEntries(results.map(({ metric, value }) => [metric, value]));

    return [{ usercount: metrics.addresses, txcount: metrics.txs }];
  };
}

function getRoutescanNewUsers(config: ChainConfig) {
  return async (_start: number, end: number) => {
    const date = new Date((end - 1) * 1e3).toISOString().slice(0, 10);
    const previousDate = new Date((end - 86401) * 1e3).toISOString().slice(0, 10);
    const data = await fetchURL(`${BASE_URL}/unique-addresses?includedChainIds=${config.chainId}&unit=day`);
    if (!Array.isArray(data)) throw new Error(`Invalid Routescan unique-addresses response for ${config.chain}`);
    const currentEntry = (data as RouteScanRow[]).find(([timestamp]) => timestamp.startsWith(date));
    const previousEntry = (data as RouteScanRow[]).reduce<RouteScanRow | undefined>((closest, row) => {
      const date = row[0].slice(0, 10);
      if (date > previousDate) return closest;
      if (!closest || date > closest[0].slice(0, 10)) return row;
      return closest;
    }, undefined);

    if (!currentEntry) throw new Error(`No Routescan unique-addresses data found for ${config.chain} on ${date}`);
    if (!previousEntry) throw new Error(`No Routescan unique-addresses data found for ${config.chain} on ${previousDate}`);

    const current = Number(currentEntry[1]);
    const previous = Number(previousEntry[1]);
    const usercount = current - previous;
    if (usercount < 0) throw new Error(`Routescan cumulative unique-addresses decreased for ${config.chain} on ${date}`);

    return [{ usercount }];
  };
}

export const routescanStatsExports = Object.entries(routescanStatsChains).map(([id, config]) => ({
  name: id,
  id,
  chain: config.chain,
  protocolType: ProtocolType.CHAIN,
  start: config.start,
  getUsers: getRoutescanUsers(config),
  getNewUsers: getRoutescanNewUsers(config),
}));
