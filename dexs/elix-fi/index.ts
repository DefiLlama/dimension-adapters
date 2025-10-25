import type {
  Adapter,
  BaseAdapter,
  FetchOptions,
  FetchResultV2,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

export type ConfigEntry = {
  indexerURL: string;
  chainId: number;
  start: string;
};

export const elixfiConfig: Record<string, ConfigEntry> = {
  [CHAIN.SOMNIA]: {
    indexerURL: "https://elixfi-indexer.up.railway.app",
    chainId: 5031,
    start: "2025-10-20",
  },
};

function getRequest(chain: string, fromTimestamp: number, toTimestamp: number): any {
  const config = elixfiConfig[chain];
  if (!config) throw new Error(`No elix.fi config for chain ${chain}`);
  const url = new URL("/sql/db", config.indexerURL);
  
  url.searchParams.set(
    "sql",
    JSON.stringify({
      json: {
        sql: 'select sum("marketOrder"."taker_got") as "volume", sum("marketOrder"."fee") as "fee", "market"."outbound_token_address" as "token" from "marketOrder" inner join "market" on "marketOrder"."ol_key_hash" = "market"."ol_key_hash" where ("marketOrder"."chain_id" = $1 and "marketOrder"."taker_got" > $2 and "marketOrder"."timestamp" >= $3 and "marketOrder"."timestamp" <= $4) group by "market"."outbound_token_address"',
        params: [
          config.chainId,
          "0",
          fromTimestamp.toString(),
          toTimestamp.toString(),
        ],
        typings: ["none", "none", "none", "none"],
      },
      meta: {
        values: {
          "params.0": ["bigint"],
          "params.1": ["bigint"],
          "params.2": ["bigint"],
          "params.3": ["bigint"],
        },
      },
    })
  );
  return new Request(url.toString(), {
    method: "POST",
  });
}

type NumString = `${number}`;
type Address = `0x${string}`;

type MetricEntry = {
  volume: NumString;
  fee: NumString;
  token: Address;
};

export async function fetchElixFiMetrics(
  chain: string,
  fromTimestamp: number,
  toTimestamp: number
): Promise<MetricEntry[]> {
  const request = getRequest(chain, fromTimestamp, toTimestamp);
  const response = await fetch(request);
  const data = await response.json();
  return data.rows || [];
}

async function fetchFunction(_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const metrics = await fetchElixFiMetrics(options.chain, options.fromTimestamp, options.toTimestamp);
  
  metrics.forEach((metric) => {
    dailyVolume.add(metric.token, metric.volume);
    dailyFees.add(metric.token, metric.fee);
  });
  
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees };
}

const adapter: Adapter = {
  adapter: {
    ...Object.entries(elixfiConfig).reduce((acc, [key, config]) => {
      acc[key] = {
        fetch:fetchFunction,
        start: config.start,
      };
      return acc;
    }, {} as BaseAdapter),
  },
  methodology: {
    Fees: "Fees are collected by the DAO on the token bought during market orders.",
    Revenue: "Fees are collected by the DAO on the token bought during market orders.",
  },
};

export default adapter;
