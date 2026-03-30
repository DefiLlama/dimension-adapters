import { SimpleAdapter } from "../adapters/types";
import { createFactoryExports } from "./registry";
import { queryAllium } from "../helpers/allium";
import { httpGet, httpPost } from "../utils/fetchURL";
import { FetchOptions } from "../adapters/types";

// --- v2 adapters: support time-range queries via FetchOptions ---

async function optimism({ }: FetchOptions) {
  throw new Error("Not implemented yet, find solution")
}

async function avalanche({ }: FetchOptions) {
  throw new Error("Not implemented yet, find solution")
}

async function flow({ }: FetchOptions) {
  throw new Error("Not implemented yet, find solution")
}

function getAlliumVolume(chain: string) {
  return async ({ startTimestamp, endTimestamp, createBalances }: FetchOptions) => {
    const query = await queryAllium(`select sum(usd_price) as usd_volume from ${chain}.nfts.trades where BLOCK_TIMESTAMP > TO_TIMESTAMP_NTZ(${startTimestamp}) AND BLOCK_TIMESTAMP < TO_TIMESTAMP_NTZ(${endTimestamp})`)
    const dailyVolume = createBalances();
    dailyVolume.addCGToken("tether", Number(query[0].usd_volume));
    return { dailyVolume };
  }
}

// --- v1 adapters: only support pulling daily/current data ---

async function immutablex({ startOfDay, createBalances }: FetchOptions) {
  const data = await httpPost('https://qbolqfa7fnctxo3ooupoqrslem.appsync-api.us-east-2.amazonaws.com/graphql',
    { "operationName": "getMetricsAll", "variables": { "address": "global" }, "query": "query getMetricsAll($address: String!) {\n  getMetricsAll(address: $address) {\n    items {\n      type\n      trade_volume_usd\n      trade_volume_eth\n      floor_price_usd\n      floor_price_eth\n      trade_count\n      owner_count\n      __typename\n    }\n    __typename\n  }\n  latestTrades(address: $address) {\n    items {\n      transfers {\n        token {\n          token_address\n          quantity\n          token_id\n          type\n          usd_rate\n          __typename\n        }\n        __typename\n      }\n      txn_time\n      txn_id\n      __typename\n    }\n    __typename\n  }\n}" },
    {
      headers: {
        "x-api-key": "da2-ceptv3udhzfmbpxr3eqisx3coe"
      }
    }
  )
  const dailyVolume = createBalances();
  const volumeUsd = data.data.getMetricsAll.items.slice(1).reduce((closest: any, item: any) => {
    if (Math.abs(new Date(item.type).getTime() / 1e3 - startOfDay) < Math.abs(new Date(closest.type).getTime() / 1e3 - startOfDay)) {
      return item;
    }
    return closest;
  }).trade_volume_usd;
  dailyVolume.addCGToken("tether", Number(volumeUsd));
  return { dailyVolume };
}

async function ronin({ createBalances }: FetchOptions) {
  const data = await httpPost('https://graphql-gateway.axieinfinity.com/graphql',
    { "operationName": "GetOverviewToday", "variables": {}, "query": "query GetOverviewToday {\n  marketStats {\n    last24Hours {\n      ...OverviewFragment\n      __typename\n    }\n    last7Days {\n      ...OverviewFragment\n      __typename\n    }\n    last30Days {\n      ...OverviewFragment\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment OverviewFragment on SettlementStats {\n  count\n  axieCount\n  volume\n  volumeUsd\n  __typename\n}\n" }
  )
  const dailyVolume = createBalances();
  dailyVolume.addCGToken("tether", Number(data.data.marketStats.last24Hours.volumeUsd));
  return { dailyVolume };
}

async function cardano({ createBalances }: FetchOptions) {
  const data = await httpGet("https://server.jpgstoreapis.com/analytics/marketStats?timeframe=24h", {
    headers: {
      "X-Jpgstore-Csrf-Protection": "1"
    }
  })
  const dailyVolume = createBalances();
  dailyVolume.addCGToken("cardano", Number(data.marketStats.volume));
  return { dailyVolume };
}

async function ethereum({ createBalances }: FetchOptions) {
  const data = await httpGet("https://nft.llama.fi/exchangeStats")
  const dailyVolume = createBalances();
  const ethVolume = data.reduce((sum: number, ex: any) => {
    if (["AlphaSharks", "Gem"].includes(ex.exchangeName) || ex.exchangeName.includes("Aggregator")) {
      return sum;
    }
    return sum + ex["1DayVolume"];
  }, 0);
  dailyVolume.addCGToken("ethereum", Number(ethVolume));
  return { dailyVolume };
}

/*
missing:
- tezos
- bsc
- mythos?
- cronos
- wax
- panini
- arbitrum
- tron
*/

const chains = [
  // v2: time-range aware
  { chain: "optimism", fetch: optimism, },
  { chain: "flow", fetch: flow, },
  { chain: "avalanche", fetch: avalanche, },
  { chain: "polygon", fetch: getAlliumVolume("polygon"), },
  { chain: "solana", fetch: getAlliumVolume("solana"), },
  //{ chain: "bitcoin",  fetch: getAlliumVolume("bitcoin"),    },
  // v1: daily/current data only
  { chain: "ethereum", fetch: ethereum, runAtCurrTime: true },
  { chain: "immutablex", fetch: immutablex,},
  { chain: "ronin", fetch: ronin, runAtCurrTime: true },
  { chain: "cardano", fetch: cardano, runAtCurrTime: true },
].reduce((acc, { chain, fetch, runAtCurrTime }) => {
  acc[chain] = { fetch: (_: any, _1: any, options: FetchOptions) => fetch(options), version: 1, runAtCurrTime, chains: [chain], };
  return acc;
}, {} as Record<string, { fetch: any, version: number, runAtCurrTime?: boolean, chains: string[] }>);


const protocols: Record<string, SimpleAdapter> = {};
for (const [name, config] of Object.entries(chains)) {
  protocols[name] = config as SimpleAdapter;
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
