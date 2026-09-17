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
      { symbol: "USDT", address: ADDRESSES.solana.USDT },
      { symbol: "USDC", address: ADDRESSES.solana.USDC },
      { symbol: "PYUSD", address: ADDRESSES.solana.PYUSD },
      { symbol: "USDS", address: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA" },
      { symbol: "EURC", address: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr" },
      { symbol: "LINK", address: "CWE8jPTUYhdCTZYWPTe1o5DFqfdjzWKc9WKz6rSjQUdG" },
      { symbol: "JUP", address: ADDRESSES.solana.JUP },
      { symbol: "SKR", address: "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3" },
    ],
  },
  [CHAIN.BASE]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "ETH", address: "native" },
      { symbol: "USDC", address: ADDRESSES.base.USDC },
      { symbol: "USDe", address: ADDRESSES.avax.USDe },
      { symbol: "USDS", address: ADDRESSES.ethereum.USDS },
      { symbol: "EURC", address: "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42" },
      { symbol: "LINK", address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196" },
    ],
  },
  [CHAIN.POLYGON]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "POL", address: "native" },
      { symbol: "USDT", address: ADDRESSES.polygon.USDT },
      { symbol: "USDC", address: ADDRESSES.polygon.USDC_CIRCLE },
      { symbol: "LINK", address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39" },
    ],
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "ETH", address: "native" },
      { symbol: "ARB", address: ADDRESSES.arbitrum.ARB },
      { symbol: "USDT", address: ADDRESSES.arbitrum.USDT },
      { symbol: "USDC", address: ADDRESSES.arbitrum.USDC_CIRCLE },
      { symbol: "USDS", address: "0x6491c05A82219b8D1479057361ff1654749b876b" },
      { symbol: "USDe", address: ADDRESSES.avax.USDe },
      { symbol: "LINK", address: ADDRESSES.arbitrum.LINK },
    ],
  },
  [CHAIN.BSC]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "BNB", address: "native" },
      { symbol: "USDT", address: ADDRESSES.bsc.USDT },
      { symbol: "USDC", address: ADDRESSES.bsc.USDC },
      { symbol: "USDe", address: ADDRESSES.avax.USDe },
      { symbol: "XRP", address: "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe" },
      { symbol: "LINK", address: "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd" },
    ],
  },
  [CHAIN.HYPERLIQUID]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "HYPE", address: "native" },
      { symbol: "USDC", address: ADDRESSES.hyperliquid.USDC },
      { symbol: "LINK", address: "0x1AC2EE68b8d038C982C1E1f73F596927dd70De59" },
    ],
  },
  [CHAIN.OPTIMISM]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "ETH", address: "native" },
      { symbol: "OP", address: ADDRESSES.optimism.OP },
      { symbol: "USDC", address: ADDRESSES.optimism.USDC_CIRCLE },
      { symbol: "USDT", address: ADDRESSES.optimism.USDT },
      { symbol: "USDe", address: ADDRESSES.avax.USDe },
      { symbol: "LINK", address: "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6" },
    ],
  },
  [CHAIN.MONAD]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "MON", address: "native" },
      { symbol: "USDC", address: ADDRESSES.monad.USDC },
      { symbol: "LINK", address: "0x76f257B1DDA5cC71bee4eF637Fbdde4C801310A9" },
    ],
  },
};

const alliumUnsupportedChains: string[] = [CHAIN.HYPERLIQUID];

async function fetchEvmInflows(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const assets = ChainConfig[options.chain].assets.filter((a) => a.address !== "native").map((a) => a.address);
  const targets = [ChainConfig[options.chain].treasury];
  if (!targets.length || !assets.length) return dailyFees;

  await addTokensReceived({ options, tokens: assets, targets, balances: dailyFees });

  if (!alliumUnsupportedChains.includes(options.chain)) {
    await getETHReceived({ options, balances: dailyFees, targets });
  }

  return dailyFees;
}

async function fetchSolanaInflows(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const mints = ChainConfig[options.chain].assets.filter((a) => a.address !== "native").map((a) => a.address).concat([ADDRESSES.solana.SOL]);

  await getSolanaReceived({ options, targets: [ChainConfig[options.chain].treasury], balances: dailyFees, mints });

  return dailyFees;
}

const fetch = async (options: FetchOptions) => {
  let dailyFees = options.createBalances();
  if (options.chain === CHAIN.SOLANA) {
    dailyFees = await fetchSolanaInflows(options);
  } else {
    dailyFees = await fetchEvmInflows(options);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: { start: "2025-06-22" },
    [CHAIN.BASE]: { start: "2025-01-01" },
    [CHAIN.POLYGON]: { start: "2025-01-01" },
    [CHAIN.ARBITRUM]: { start: "2026-03-22" },
    [CHAIN.BSC]: { start: "2026-03-22" },
    [CHAIN.HYPERLIQUID]: { start: "2026-04-09" },
    [CHAIN.OPTIMISM]: { start: "2026-01-31" },
    [CHAIN.MONAD]: { start: "2026-03-23" },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Transaction fees paid by users for fiat to crypto settlements.",
    Revenue: "Revenue represents fees collected by PagFinance from fiat to crypto settlements.",
    ProtocolRevenue: "Revenue represents fees collected by PagFinance from fiat to crypto settlements.",
  },
};

export default adapter;
