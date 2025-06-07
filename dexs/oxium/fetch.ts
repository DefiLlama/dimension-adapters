import { oxiumConfig } from "./config";

function getRequest(chain: string, fromTimestamp: number, toTimestamp: number) {
  const config = oxiumConfig[chain];
  if (!config) throw new Error(`No oxium config for chain ${chain}`);
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

export async function fetchOxiumMetrics(
  chain: string,
  fromTimestamp: number,
  toTimestamp: number
): Promise<MetricEntry[]> {
  const request = getRequest(chain, fromTimestamp, toTimestamp);
  const response = await fetch(request);
  const data = await response.json();
  return data.rows;
}
