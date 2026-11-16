import { request } from "graphql-request";
import { FetchOptions } from "../adapters/types";

// dreamDEX on Somnia Tokyo (chainId 50321) - the indexer the dreamDEX app itself reads (Hasura over an Envio index).
// Spot, perp and event-contract (binary) markets share one schema and are told apart by `marketType`.
export const DREAMDEX_TOKYO_INDEXER = "https://tokyo-prd.smk.somnia.host/v1/graphql";

// Every Tokyo market is quoted in USDso (18 decimals). The Tokyo token (0xcea80aeb6ed4ed526d71f34efed047904c0e387a) is the
// Hyperlane synthetic of Somnia mainnet USDso, whose collateral stays locked on mainnet, so amounts are priced as the mainnet token.
export const USDSO = "somnia:0x00000022da000002656c64d9ea6011ea952d008a";

export type DreamdexMarketType = "SPOT" | "PERP";

const PAGE_SIZE = 1000;

async function queryAll(field: string, where: string, fields: string): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const query = `{ ${field}(where: ${where}, order_by: {id: asc}, limit: ${PAGE_SIZE}, offset: ${offset}) { ${fields} } }`;
    const page = (await request(DREAMDEX_TOKYO_INDEXER, query))[field];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// Quote (USDso, raw 18 decimals) volume traded in the window, from the indexer's hourly candles. Each fill is counted once.
// Windows are hour aligned (hourly and daily pulls), so whole hourly buckets cover them exactly; summed hourly candles were
// checked against the raw `Fill` rows for a 24h window and match to the cent for both market types.
export async function getTokyoQuoteVolume(options: FetchOptions, marketType: DreamdexMarketType): Promise<bigint> {
  const { startTimestamp, endTimestamp } = options;
  if (startTimestamp % 3600 || endTimestamp % 3600)
    throw new Error(`dreamdex: window ${startTimestamp}-${endTimestamp} is not hour aligned`);

  const candles = await queryAll(
    "Candle",
    `{intervalSeconds: {_eq: 3600}, bucketStart: {_gte: "${startTimestamp}", _lt: "${endTimestamp}"}, market: {marketType: {_eq: "${marketType}"}}}`,
    "quoteVolume",
  );
  return candles.reduce((total, candle) => total + BigInt(candle.quoteVolume), 0n);
}

// Fees charged by the perp engine in the window (USDso, raw 18 decimals).
export async function getTokyoPerpFeeRecords(options: FetchOptions): Promise<{ kind: string, amount: string, isRebate: boolean }[]> {
  return queryAll(
    "PerpFeeRecord",
    `{timestamp: {_gte: "${options.startTimestamp}", _lt: "${options.endTimestamp}"}}`,
    "kind amount isRebate",
  );
}
