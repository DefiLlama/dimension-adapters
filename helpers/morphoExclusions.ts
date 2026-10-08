import * as sdk from "@defillama/sdk";
import { getConfig } from "./cache";
import { httpGet } from "../utils/fetchURL";

// Morpho's own exclusion feed. Additive: unioned with the hardcoded lists and the insolvent-markets
// cache, never a replacement - the feed is currently a subset of what we already exclude.
const BASE_URL = "https://api.morpho.org/reporting/v1/exclusions";
const KINDS = ["markets", "assets", "vaults"];

interface ExclusionRow {
  chain: string;
  effective_from: string;
  effective_to: string;
  [key: string]: string;
}

// the feed is plain comma-separated with no quoting; reason is last, so any extra commas fold into it
function parseCsv(text: string): Array<ExclusionRow> {
  const lines = String(text).trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(",");
    const row: any = {};
    header.forEach((h, i) => {
      row[h] = (i === header.length - 1 ? parts.slice(i).join(",") : parts[i] || "").trim();
    });
    return row as ExclusionRow;
  });
}

// a header-only file is a valid empty list; a missing key means we never got that file
const isValidBundle = (bundle: any) => !!bundle && KINDS.every((k) => Array.isArray(bundle[k]));

async function getExclusions(): Promise<Record<string, Array<ExclusionRow>> | null> {
  const bundle = await getConfig("morpho-blue/exclusions", undefined, {
    fetcher: async () => {
      const files = await Promise.all(KINDS.map((f) => httpGet(`${BASE_URL}/${f}.csv`)));
      const fetched = Object.fromEntries(KINDS.map((k, i) => [k, parseCsv(files[i])]));
      // a partial fetch must not overwrite the cache - getConfig falls back to the last good copy
      if (!isValidBundle(fetched)) throw new Error("morpho exclusions: incomplete feed");
      return fetched;
    },
  });
  if (!isValidBundle(bundle)) {
    sdk.log("morpho exclusions: no valid feed and no cache, running without feed exclusions");
    return null;
  }
  return bundle;
}

// effective_from is inclusive, effective_to exclusive and empty while the exclusion is still active
const isActive = (row: ExclusionRow, dateString: string) =>
  (!row.effective_from || row.effective_from <= dateString) &&
  (!row.effective_to || row.effective_to > dateString);

async function getRows(kind: string, chain: string, dateString: string): Promise<Array<ExclusionRow>> {
  const exclusions = await getExclusions();
  const rows = exclusions?.[kind] ?? [];
  return rows.filter((row) => row.chain === chain && isActive(row, dateString));
}

export const getExcludedMarketIds = async (chain: string, dateString: string): Promise<Array<string>> =>
  (await getRows("markets", chain, dateString)).map((i) => i.market_id.toLowerCase());

export const getExcludedAssets = async (chain: string, dateString: string): Promise<Array<string>> =>
  (await getRows("assets", chain, dateString)).map((i) => i.asset_address.toLowerCase());

export const getExcludedVaults = async (chain: string, dateString: string): Promise<Array<string>> =>
  (await getRows("vaults", chain, dateString)).map((i) => i.vault_address.toLowerCase());
