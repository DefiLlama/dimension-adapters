// index.ts (PagCrypto - fees/revenue adapter skeleton)
//
// Goal:
// - Track "what passes through PagCrypto wallets" per chain by summing token transfers to your wallets.
// - Convert to USD using Dune pre-joined usd fields when available (or leave as TODO if not available).
//
// Notes:
// - You MUST set wallet addresses for each chain (env vars below).
// - This file is written to be aligned with your JSON: only chains/assets with status=true are enabled.

import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

// -----------------------------
// 1) CONFIG (from your JSON)
// -----------------------------

type ChainKey = "solana" | "base" | "polygon" | "tron" | "xrpl";

type AssetCfg = {
  symbol: string;
  address: string; // "native" or token mint / contract / issued currency
  decimals: number;
  status: boolean;
};

type ChainCfg = {
  key: ChainKey;
  status: boolean;
  assets: AssetCfg[];
};

const CONFIG: Record<ChainKey, ChainCfg> = {
  solana: {
    key: "solana",
    status: true,
    assets: [
      { symbol: "SOL", address: "native", decimals: 9, status: true },
      { symbol: "USDT", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, status: true },
      { symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, status: true },
      { symbol: "PYUSD", address: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", decimals: 6, status: true },
      { symbol: "USDS", address: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA", decimals: 6, status: true },
      { symbol: "EURC", address: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr", decimals: 6, status: true },
      { symbol: "LINK", address: "CWE8jPTUYhdCTZYWPTe1o5DFqfdjzWKc9WKz6rSjQUdG", decimals: 6, status: true },
      { symbol: "JUP", address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", decimals: 6, status: true },
      { symbol: "SKR", address: "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3", decimals: 6, status: true },
      // TRUMP/WETH are status:false in your JSON => intentionally excluded here
    ],
  },

  base: {
    key: "base",
    status: true,
    assets: [
      { symbol: "ETH", address: "native", decimals: 18, status: true },
      // base USDC enabled in your JSON
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, status: true },
      { symbol: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", decimals: 6, status: true },
      { symbol: "USDS", address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", decimals: 6, status: true },
      { symbol: "EURC", address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", decimals: 6, status: true },
      { symbol: "LINK", address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196", decimals: 6, status: true },
      // base USDT is status:false in your JSON => excluded
    ],
  },

  polygon: {
    key: "polygon",
    status: true,
    assets: [
      { symbol: "POL", address: "native", decimals: 18, status: true },
      { symbol: "USDT", address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6, status: true },
      { symbol: "USDC", address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", decimals: 6, status: true },
      { symbol: "LINK", address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", decimals: 6, status: true },
    ],
  },

  tron: {
    key: "tron",
    status: true,
    assets: [
      // TRX native
      { symbol: "TRX", address: "native", decimals: 6, status: true },
      // USDT/USDC are status:false in your JSON => excluded
    ],
  },

  xrpl: {
    key: "xrpl",
    status: true,
    assets: [
      { symbol: "XRP", address: "native", decimals: 6, status: true },
      { symbol: "RLUSD", address: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", decimals: 6, status: true },
    ],
  },
};

const WALLETS: Record<ChainKey, string[]> = {
  solana: "5XvzUs92L7G4picBJchfatM25RcR93oE3h8xGRZe7462" as any,
  base: "0xC8e3BC38C3e4D768f83a1a064BdE4045aFf3158C" as any,
  polygon: "0xC8e3BC38C3e4D768f83a1a064BdE4045aFf3158C" as any,
  tron: "TA9Xywe3xb6GPeBFYDdTkdT43DktDPnyDT" as any,
  xrpl: "rD6YURvhPwmUwRCrFJX6pFU81obJNk7WyA" as any,
};

function assertWalletsConfigured() {
  const missing = (Object.keys(WALLETS) as ChainKey[])
      .filter((k) => CONFIG[k].status && WALLETS[k].length === 0);

  if (missing.length) {
    throw new Error(
        `Missing PagCrypto wallet env vars for: ${missing.join(", ")}`
    );
  }
}

// -----------------------------
// 3) SQL builders
// -----------------------------

function sqlList(items: any): string {
  // Accept string (comma-separated), array, null/undefined, anything.
  if (items == null) return "''";

  let arr: string[];

  if (Array.isArray(items)) {
    arr = items.map((x) => String(x));
  } else if (typeof items === "string") {
    arr = items.split(",").map((s) => s.trim());
  } else {
    // fallback: single value
    arr = [String(items)];
  }

  const cleaned = arr.map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned.map((x) => `'${x}'`).join(", ") : "''";
}


function enabledAssets(chain: ChainKey) {
  return CONFIG[chain].assets.filter((a) => a.status);
}

// SOLANA: use SPL transfers for token mints + native SOL transfers (often separate tables).
// Many Dune Solana schemas provide token transfers with mint address; native SOL may require system transfers table.
// Here we implement SPL token transfers in a conservative way and leave native SOL as TODO.
function buildSolanaSql(options: FetchOptions) {
  const wallets = WALLETS.solana; // string[]
  const assets = enabledAssets("solana");

  const splMints = assets
      .filter((a) => a.address !== "native")
      .map((a) => a.address);

  if (!wallets.length || !splMints.length) {
    return `SELECT 'solana' AS chain, 0 AS volume_usd`;
  }

  return `
    WITH spl_in AS (
      SELECT
        'solana' AS chain,
        SUM(COALESCE(amount_usd, 0)) AS usd_in
      FROM tokens_solana.transfers
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND to_owner IN (${sqlList(wallets)})
        AND token_mint_address IN (${sqlList(splMints)})
    )
    SELECT chain, COALESCE(usd_in, 0) AS volume_usd
    FROM spl_in
  `;
}

function normalizeStringArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [String(value)].map((s) => s.trim()).filter(Boolean);
}

function getWallets(chainKey: string): string[] {
  return normalizeStringArray((WALLETS as any)[chainKey]);
}


// EVM: use a transfers table and filter by "to" and token_address.
// Dune commonly has ERC20 transfers tables per chain; some setups also have unified tables.
function buildEvmSql(options: FetchOptions, chainKey: "base" | "polygon") {
  const wallets = getWallets(chainKey).map((w) => w.toLowerCase());
  const assets = enabledAssets(chainKey);
  const erc20s = assets
      .filter((a) => a.address !== "native")
      .map((a) => a.address.toLowerCase());

  if (!wallets.length || !erc20s.length) {
    return `SELECT '${chainKey}' AS chain, 0 AS volume_usd`;
  }

  return `
    SELECT
      '${chainKey}' AS chain,
      COALESCE(SUM(amount_usd), 0) AS volume_usd
    FROM tokens.transfers
    WHERE block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND blockchain = '${chainKey}'
      AND lower("to") IN (${sqlList(wallets)})
      AND lower(token_address) IN (${sqlList(erc20s)})
  `;
}

// TRON: Dune has Tron datasets (token transfers, etc.). :contentReference[oaicite:2]{index=2}
// You will likely need to join prices for USD, depending on the table you choose.
// This is a stub that still filters transfers to your wallets.
function buildTronSql(options: FetchOptions) {
  const wallets = WALLETS.tron;
  // Your JSON only has native TRX enabled; if you later enable TRC20, add contract filter similar to EVM.
  return `
    SELECT
      'tron' AS chain,
      0 AS volume_usd
    -- TODO: implement using Tron transfer tables + pricing join on Dune
  `;
}

// XRPL: Dune has XRPL data catalog but querying "what passes through wallets" is not identical to ERC20/SPL. :contentReference[oaicite:3]{index=3}
// Keep as stub until you decide which XRPL metric you want (XRP Payments? Issued Currency transfers?).
function buildXrplSql(_options: FetchOptions) {
  return `
    SELECT
      'xrpl' AS chain,
      0 AS volume_usd
    -- TODO: implement XRPL payments/issued currency flow query on Dune
  `;
}

// -----------------------------
// 4) Prefetch + Fetch
// -----------------------------

function hasDuneKey(): boolean {
  // Adjust if your repo uses a different env var name
  return Boolean(process.env.DUNE_API_KEY || process.env.DUNE_KEY || process.env.DUNE_API_TOKEN);
}

const prefetch = async (options: FetchOptions) => {
  assertWalletsConfigured();

  // If running in CI/local without Dune credentials, return empty results (0).
  if (!hasDuneKey()) {
    return [];
  }

  const queries: string[] = [];

  if (CONFIG.solana.status) queries.push(buildSolanaSql(options));
  if (CONFIG.base.status) queries.push(buildEvmSql(options, "base"));
  if (CONFIG.polygon.status) queries.push(buildEvmSql(options, "polygon"));
  if (CONFIG.tron.status) queries.push(buildTronSql(options));
  if (CONFIG.xrpl.status) queries.push(buildXrplSql(options));

  // union results from all enabled chains
  const sql = `
    WITH all_chain_results AS (
      ${queries.map((q, i) => (i === 0 ? q : `UNION ALL ${q}`)).join("\n")}
    )
    SELECT chain, SUM(volume_usd) AS volume_usd
    FROM all_chain_results
    GROUP BY chain
  `;

  return queryDuneSql(options, sql);
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const results = options.preFetchedResults || [];
  const row = results.find((r: any) => r.chain === String(options.chain).toLowerCase());

  // Here we are treating "volume through wallet" as "fees" only as a placeholder.
  // In a proper fees adapter, you typically compute actual fee revenue (spread, protocol fee, etc.)
  // If you want: set dailyVolume instead (different dashboard) or compute revenue separately.
  if (row?.volume_usd) dailyFees.addUSDValue(Number(row.volume_usd));

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  adapter: {
    [CHAIN.SOLANA]: { start: "2024-01-01" },
    [CHAIN.BASE]: { start: "2024-01-01" },
    [CHAIN.POLYGON]: { start: "2024-01-01" },
    [CHAIN.TRON]: { start: "2024-01-01" },
    // If the chain constant differs in your repo, rename accordingly.
    // Some repos use CHAIN.XRPL, others CHAIN.RIPPLE, etc.
    [CHAIN.XRPL]: { start: "2024-01-01" },
  },
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "Counts USD-denominated token flow into PagCrypto-controlled wallets (proxy). Replace with real fee revenue logic (spread/protocol fee) when available.",
    Revenue: "Same as Fees (proxy).",
    ProtocolRevenue: "Same as Fees (proxy).",
  },
};

export default adapter;

