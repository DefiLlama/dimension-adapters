import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {addTokensReceived, getSolanaReceived, getSolanaReceivedDune} from "../../helpers/token";

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

  const targets = normalizeTargets(WALLETS.solana); // array of solana owners
  const mints = enabledAssets("solana")
      .filter((a) => a.address !== "native")
      .map((a) => a.address); // SPL mint addresses

  if (!targets.length || !mints.length) return dailyFees;

  // getSolanaReceived should return balances (token amounts), which balances can price to USD
  const inflows = await getSolanaReceived({
    options,
    targets: targets,      // some helpers call it owners
    tokens: mints,        // or mints
  } as any);

  dailyFees.addBalances(inflows);
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
    dailyFees = await fetchStub(options);
  } else if ((options.chain as any) === (CHAIN as any).XRPL && CONFIG.xrpl.status) {
    dailyFees = await fetchStub(options);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
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
