import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived, getSolanaReceived } from "../../helpers/token";
import { queryDuneSql } from "../../helpers/dune";

type ChainKey = "solana" | "base" | "polygon" | "tron" | "xrpl";

type AssetCfg = {
  symbol: string;
  address: string;
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
    ],
  },

  base: {
    key: "base",
    status: true,
    assets: [
      { symbol: "ETH", address: "native", decimals: 18, status: true },
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, status: true },
      { symbol: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", decimals: 6, status: true },
      { symbol: "USDS", address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", decimals: 6, status: true },
      { symbol: "EURC", address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", decimals: 6, status: true },
      { symbol: "LINK", address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196", decimals: 6, status: true },
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
    assets: [{ symbol: "TRX", address: "native", decimals: 6, status: true }],
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
  const missing = (Object.keys(WALLETS) as ChainKey[]).filter(
      (k) => CONFIG[k].status && WALLETS[k].length === 0
  );

  if (missing.length) {
    throw new Error(`Missing PagCrypto wallet env vars for: ${missing.join(", ")}`);
  }
}

function enabledAssets(chain: ChainKey) {
  return CONFIG[chain].assets.filter((a) => a.status);
}

function normalizeTargets(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [String(value)].map((s) => s.trim()).filter(Boolean);
}

async function fetchEvmInflows(options: FetchOptions, chainKey: "base" | "polygon") {
  const dailyFees = options.createBalances();

  const tokens = enabledAssets(chainKey)
      .filter((a) => a.address !== "native")
      .map((a) => a.address);

  const targets = normalizeTargets(WALLETS[chainKey]);

  if (!targets.length || !tokens.length) return dailyFees;

  const inflows = await addTokensReceived({
    options,
    tokens,
    target: targets[0],
    targets,
  } as any);

  dailyFees.addBalances(inflows);
  return dailyFees;
}

async function fetchSolanaInflows(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const targets = normalizeTargets(WALLETS.solana);
  const mints = enabledAssets("solana")
      .filter((a) => a.address !== "native")
      .map((a) => a.address);

  if (!targets.length || !mints.length) return dailyFees;

  const inflows = await getSolanaReceived({
    options,
    targets: targets,
    tokens: mints,
  } as any);

  dailyFees.addBalances(inflows);
  return dailyFees;
}


async function fetchTronInflowsDune(options: FetchOptions) {
  const dailyFees = options.createBalances();

  // TRON no dataset tokens.transfers costuma vir em formato hex (0x...)
  const targets = normalizeTargets(WALLETS.tron);
  if (!targets.length) return dailyFees;

  // tokens TRC20 habilitados (endereço de contrato)
  const tokenAddrs = enabledAssets("tron")
      .filter((a) => a.address !== "native")
      .map((a) => a.address);

  // fallback: USDT TRC20 (TR7N...)
  const tokens = tokenAddrs.length ? tokenAddrs : ["TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"];

  const targetList = targets.map((t) => `LOWER('${t}')`).join(",");

  const trc20List = tokens.map((t) => `LOWER('${t}')`).join(",");

  // 1) TRX nativo (token_standard='native')
  const nativeSql = `
    SELECT
      SUM(amount) AS amount
    FROM tokens.transfers
    WHERE blockchain = 'tron'
      AND block_time >= to_timestamp(${options.fromTimestamp})
      AND block_time <  to_timestamp(${options.toTimestamp})
      AND token_standard = 'native'
      AND "to" IN (${targetList})
  `;

  const nativeRows: any[] = await queryDuneSql(options, nativeSql);
  const nativeAmount = nativeRows?.[0]?.amount;
  if (nativeAmount != null) {
    // padrão DefiLlama: pode usar 'tron' ou 'tron:TRX' dependendo do seu adapter
    dailyFees.add("tron", nativeAmount);
  }

  // 2) TRC20 (token_standard != native) filtrando por contract_address
  const trc20Sql = `
    SELECT
      contract_address AS token_address,
      SUM(amount) AS amount
    FROM tokens.transfers
    WHERE blockchain = 'tron'
      AND block_time >= to_timestamp(${options.fromTimestamp})
      AND block_time <  to_timestamp(${options.toTimestamp})
      AND token_standard <> 'native'
      AND "to" IN (${targetList})
      AND contract_address IN (${trc20List})
    GROUP BY 1
  `;

  const trc20Rows: any[] = await queryDuneSql(options, trc20Sql);
  trc20Rows?.forEach((r) => {
    if (!r?.token_address || r?.amount == null) return;
    dailyFees.add(`tron:${String(r.token_address).toLowerCase()}`, r.amount);
  });

  return dailyFees;
}

async function fetchXrplInflowsDune(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const targets = normalizeTargets(WALLETS.xrpl);
  if (!targets.length) return dailyFees;

  const rlusdIssuer = enabledAssets("xrpl").find((a) => a.symbol === "RLUSD")?.address;
  const targetList = targets.map((t) => `'${t}'`).join(",");

  const sql = `
    SELECT
      amount.currency AS currency,
      amount.issuer   AS issuer,
      SUM(CAST(amount.value AS DOUBLE)) AS amount
    FROM xrpl.transactions
    WHERE _event_created_at >= to_timestamp(${options.fromTimestamp})
      AND _event_created_at <  to_timestamp(${options.toTimestamp})
      AND transaction_type = 'Payment'
      AND destination IN (${targetList})
      ${rlusdIssuer ? `AND amount.currency = 'RLUSD' AND amount.issuer = '${rlusdIssuer}'` : ""}
    GROUP BY 1,2
  `;

  const rows: any[] = await queryDuneSql(options, sql);
  rows?.forEach((r) => {
    if (!r?.currency || r?.amount == null) return;

    // XRPL amounts are decimal; normalize to 6-decimal base units for stablecoins by default.
    const baseUnits = Math.round(Number(r.amount) * 1e6);
    const issuer = r.issuer || "native";
    dailyFees.add(`xrpl:${r.currency}:${issuer}`, baseUnits);
  });

  return dailyFees;
}


async function fetchStub(options: FetchOptions) {
  return options.createBalances();
}

const fetch = async (...args: any[]) => {
  const options: FetchOptions | undefined =
      args.find((a) => a && typeof a === "object" && typeof a.createBalances === "function");

  if (!options) {
    throw new Error("PagCrypto adapter: FetchOptions not provided by runner (missing createBalances).");
  }

  assertWalletsConfigured();

  let dailyFees = options.createBalances();

  if (options.chain === CHAIN.BASE && CONFIG.base.status) {
    dailyFees = await fetchEvmInflows(options, "base");
  } else if (options.chain === CHAIN.POLYGON && CONFIG.polygon.status) {
    dailyFees = await fetchEvmInflows(options, "polygon");
  } else if (options.chain === CHAIN.SOLANA && CONFIG.solana.status) {
    dailyFees = await fetchSolanaInflows(options);
  } else if (options.chain === CHAIN.TRON && CONFIG.tron.status) {
    dailyFees = await fetchTronInflowsDune(options);
  } else if (options.chain === CHAIN.XRPL && CONFIG.xrpl.status) {
    dailyFees = await fetchXrplInflowsDune(options);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  dependencies: [Dependencies.DUNE],
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: "2025-01-01" },
    [CHAIN.POLYGON]: { start: "2025-01-01" },
    [CHAIN.SOLANA]: { start: "2025-01-01" },
    [CHAIN.TRON]: { start: "2025-01-01" },
    [CHAIN.XRPL]: { start: "2025-01-01" },
  },
  methodology: {
    Fees: "ERC20 token inflows into PagCrypto-controlled wallets on supported EVM chains (Base/Polygon).",
    Revenue: "Same as Fees.",
    ProtocolRevenue: "Same as Fees.",
  },
};

export default adapter;