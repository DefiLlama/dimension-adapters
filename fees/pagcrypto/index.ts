import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived, getETHReceived, getSolanaReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";

type AssetCfg = {
  symbol: string;
  address: string;
};

const ChainConfig: Record<string, { treasury: string, assets: AssetCfg[] }> = {
  [CHAIN.SOLANA]: {
    treasury: "5XvzUs92L7G4picBJchfatM25RcR93oE3h8xGRZe7462",
    assets: [
      { symbol: "SOL", address: "native" },
      { symbol: "USDT", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
      { symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
      { symbol: "PYUSD", address: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo" },
      { symbol: "USDS", address: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA" },
      { symbol: "EURC", address: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr" },
      { symbol: "LINK", address: "CWE8jPTUYhdCTZYWPTe1o5DFqfdjzWKc9WKz6rSjQUdG" },
      { symbol: "JUP", address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
      { symbol: "SKR", address: "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3" },
    ],
  },
  [CHAIN.BASE]: {
    treasury: "0xC8e3BC38C3e4D768f83a1a064BdE4045aFf3158C",
    assets: [
      { symbol: "ETH", address: "native" },
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
      { symbol: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34" },
      { symbol: "USDS", address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F" },
      { symbol: "EURC", address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42" },
      { symbol: "LINK", address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196" },
    ],
  },
  [CHAIN.POLYGON]: {
    treasury: "0xC8e3BC38C3e4D768f83a1a064BdE4045aFf3158C",
    assets: [
      { symbol: "POL", address: "native" },
      { symbol: "USDT", address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" },
      { symbol: "USDC", address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" },
      { symbol: "LINK", address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39" },
    ],
  },
  [CHAIN.TRON]: {
    treasury: "TA9Xywe3xb6GPeBFYDdTkdT43DktDPnyDT",
    assets: [{ symbol: "TRX", address: "native" }],
  },
  [CHAIN.XRPL]: {
    treasury: "rD6YURvhPwmUwRCrFJX6pFU81obJNk7WyA",
    assets: [
      { symbol: "XRP", address: "native" },
      { symbol: "RLUSD", address: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De" },
    ],
  },
};


async function fetchEvmInflows(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const assets = ChainConfig[options.chain].assets.filter((a) => a.address !== "native").map((a) => a.address);
  const targets = [ChainConfig[options.chain].treasury];
  if (!targets.length || !assets.length) return dailyFees;

  await addTokensReceived({ options, tokens: assets, targets, balances: dailyFees });
  await getETHReceived({ options, balances: dailyFees, targets });

  return dailyFees;
}

async function fetchSolanaInflows(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const mints = ChainConfig[options.chain].assets.filter((a) => a.address !== "native").map((a) => a.address).concat([ADDRESSES.solana.SOL]);

  await getSolanaReceived({ options, targets: [ChainConfig[options.chain].treasury], balances: dailyFees, mints });

  return dailyFees;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  let dailyFees = options.createBalances();
  if ([CHAIN.XRPL, CHAIN.TRON].includes(options.chain as CHAIN)) {
    throw new Error("Fetching fees for XRPL and TRON is not supported yet");
  }
  if (options.chain == CHAIN.SOLANA) {
    dailyFees = await fetchSolanaInflows(options);
  }
  if ([CHAIN.BASE, CHAIN.POLYGON].includes(options.chain as CHAIN)) {
    dailyFees = await fetchEvmInflows(options);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};


const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: "2025-01-01" },
    [CHAIN.POLYGON]: { start: "2025-01-01" },
    [CHAIN.SOLANA]: { start: "2025-01-01" },
    // [CHAIN.TRON]: { start: "2025-01-01" },
    // [CHAIN.XRPL]: { start: "2025-01-01" },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Transaction fees paid by users for fiat to crypto settlements.",
    Revenue: "Revenue represents fees collected by PagCrypto from fiat to crypto settlements.",
    ProtocolRevenue: "Revenue represents fees collected by PagCrypto from fiat to crypto settlements.",
  },
};

export default adapter;
