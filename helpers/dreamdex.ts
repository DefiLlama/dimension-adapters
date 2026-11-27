import { request } from "graphql-request";
import { Balances } from "@defillama/sdk";
import { FetchOptions } from "../adapters/types";

// dreamDEX on Somnia Tokyo (chainId 50321) - the indexer the dreamDEX app itself reads (Hasura over an Envio index).
// Spot, perp and event-contract (binary) markets share one schema and are told apart by `marketType`.
export const DREAMDEX_TOKYO_INDEXER = "https://tokyo-prd.smk.somnia.host/v1/graphql";

// Every Tokyo market is quoted in USDso (18 decimals), the Hyperlane synthetic of Somnia mainnet USDso.
// The Tokyo token (coreAssets somnia_tokyo.USDso) has no price feed of its own since 2026-11-20 (#11299), so amounts
// are valued as the Somnia mainnet USDso it is minted against (also 18 decimals).
export const USDSO = "somnia:0x00000022da000002656c64d9ea6011ea952d008a";

// USDSO already carries its chain prefix, so it is added with skipChain (balances on somnia_tokyo would prefix it again).
export function addUsdso(balances: Balances, amount: bigint | string, label?: string) {
  balances.add(USDSO, amount, { label, skipChain: true });
}

export function subtractUsdso(balances: Balances, amount: bigint | string, label?: string) {
  balances.subtractToken(USDSO, amount, { label, skipChain: true });
}

export type DreamdexMarketType = "SPOT" | "PERP";

const PAGE_SIZE = 1000;
const HOUR = 3600;

async function queryAll(field: string, where: string, fields: string): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = `{ ${field}(where: ${where}, order_by: {id: asc}, limit: ${PAGE_SIZE}, offset: ${offset}) { ${fields} } }`;
    const page = (await request(DREAMDEX_TOKYO_INDEXER, query))[field];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// The indexer only holds rows up to the last block it has processed, so throw instead of storing a partial window while it lags.
async function assertIndexedThrough(endTimestamp: number) {
  const { _meta } = await request(DREAMDEX_TOKYO_INDEXER, "{ _meta { progressBlockTime } }");
  const progressBlockTime = _meta[0]?.progressBlockTime;
  if (!(Date.parse(progressBlockTime) / 1000 >= endTimestamp))
    throw new Error(`dreamdex: indexer synced to ${progressBlockTime}, window ends ${new Date(endTimestamp * 1000).toISOString()}`);
}

// Quote (USDso, raw 18 decimals) volume traded in the window, from the indexer's hourly candles. Each fill is counted once.
export async function getTokyoQuoteVolume(options: FetchOptions, marketType: DreamdexMarketType): Promise<bigint> {
  const from = Math.ceil(options.startTimestamp / HOUR) * HOUR;
  const to = Math.ceil(options.endTimestamp / HOUR) * HOUR;
  await assertIndexedThrough(options.endTimestamp);

  const candles = await queryAll(
    "Candle",
    `{intervalSeconds: {_eq: 3600}, bucketStart: {_gte: "${from}", _lt: "${to}"}, market: {marketType: {_eq: "${marketType}"}}}`,
    "quoteVolume",
  );
  return candles.reduce((total, candle) => total + BigInt(candle.quoteVolume), 0n);
}

export type DreamdexPerpFeeRecord = { kind: string, amount: string, isRebate: boolean, insurancePortion: string | null };

// Fees charged (or rebated) by the perp engine in the window (USDso, raw 18 decimals).
export async function getTokyoPerpFeeRecords(options: FetchOptions): Promise<DreamdexPerpFeeRecord[]> {
  return queryAll(
    "PerpFeeRecord",
    `{timestamp: {_gte: "${options.startTimestamp}", _lt: "${options.endTimestamp}"}}`,
    "kind amount isRebate insurancePortion",
  );
}

// Gas refunds paid to the keeper that executes each liquidation, in the window (USDso, raw 18 decimals).
export async function getTokyoKeeperRewards(options: FetchOptions): Promise<string[]> {
  const rows = await queryAll(
    "LiquidationEvent",
    `{kind: {_eq: "KeeperReward"}, timestamp: {_gte: "${options.startTimestamp}", _lt: "${options.endTimestamp}"}}`,
    "keeperReward",
  );
  return rows.map((row) => row.keeperReward);
}
