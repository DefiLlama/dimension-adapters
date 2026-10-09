import * as sdk from "@defillama/sdk";
import { getConfig } from "./cache";
import { httpGet } from "../utils/fetchURL";

// Morpho's own exclusion feed. Additive: unioned with the hardcoded lists and the insolvent-markets
// cache, never a replacement - the feed is currently a subset of what we already exclude.
const BASE_URL = "https://api.morpho.org/reporting/v1/exclusions";
// required columns per file: a response that does not carry them is not a CSV we understand,
// which is how an html error page served as 200 is told apart from a genuine header-only file
const KINDS: Record<string, Array<string>> = {
  markets: ["chain", "market_id", "effective_from", "effective_to"],
  assets: ["chain", "asset_address", "effective_from", "effective_to"],
  vaults: ["chain", "vault_address", "effective_from", "effective_to"],
};

interface ExclusionRow {
  chain: string;
  effective_from: string;
  effective_to: string;
  [key: string]: string;
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isId = (v: string) => /^0x[0-9a-fA-F]+$/.test(v);

// the feed is plain comma-separated with no quoting; reason is last, so any extra commas fold into it.
// returns null when the header or any row is malformed, so the caller can keep the old cache: a
// truncated file would otherwise read as a short but valid list and silently drop live exclusions
function parseCsv(text: string, requiredColumns: Array<string>): Array<ExclusionRow> | null {
  const lines = String(text).trim().split("\n").filter(Boolean);
  if (!lines.length) return null;
  const header = lines[0].split(",").map((h) => h.trim());
  if (!requiredColumns.every((c) => header.includes(c))) return null;

  const rows: Array<ExclusionRow> = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    if (parts.length < header.length) return null; // truncated row
    const row: any = {};
    header.forEach((h, i) => {
      row[h] = (i === header.length - 1 ? parts.slice(i).join(",") : parts[i] || "").trim();
    });
    const idColumn = requiredColumns[1];
    if (!row.chain || !isId(row[idColumn] || "")) return null;
    if (!isDate(row.effective_from) || (row.effective_to && !isDate(row.effective_to))) return null;
    rows.push(row as ExclusionRow);
  }
  return rows;
}

// a header-only file is a valid empty list; a missing key means we never got a usable version of it
const isValidBundle = (bundle: any) => !!bundle && Object.keys(KINDS).every((k) => Array.isArray(bundle[k]));

async function getExclusions(): Promise<Record<string, Array<ExclusionRow>> | null> {
  const kinds = Object.keys(KINDS);
  const bundle = await getConfig("morpho-blue/exclusions", undefined, {
    fetcher: async () => {
      const files = await Promise.all(kinds.map((f) => httpGet(`${BASE_URL}/${f}.csv`)));
      const fetched: any = {};
      kinds.forEach((k, i) => {
        const rows = parseCsv(files[i], KINDS[k]);
        if (rows) fetched[k] = rows;
      });
      // a partial or malformed fetch must not overwrite the cache - getConfig keeps the last good copy
      if (!isValidBundle(fetched)) throw new Error("morpho exclusions: incomplete or malformed feed");
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

// Market ids morpho excludes on `chain`, active on `dateString` (effective_from inclusive, effective_to exclusive).
export const getExcludedMarketIds = async (chain: string, dateString: string): Promise<Array<string>> =>
  (await getRows("markets", chain, dateString)).map((i) => i.market_id.toLowerCase());

// Asset addresses morpho excludes on `chain`, active on `dateString` (effective_from inclusive, effective_to exclusive).
export const getExcludedAssets = async (chain: string, dateString: string): Promise<Array<string>> =>
  (await getRows("assets", chain, dateString)).map((i) => i.asset_address.toLowerCase());

// Vault addresses morpho excludes on `chain`, active on `dateString` (effective_from inclusive, effective_to exclusive).
export const getExcludedVaults = async (chain: string, dateString: string): Promise<Array<string>> =>
  (await getRows("vaults", chain, dateString)).map((i) => i.vault_address.toLowerCase());
