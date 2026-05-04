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
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
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
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "POL", address: "native" },
      { symbol: "USDT", address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" },
      { symbol: "USDC", address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" },
      { symbol: "LINK", address: "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39" },
    ],
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "ETH", address: "native" },
      { symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548" },
      { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
      { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
      { symbol: "USDS", address: "0x6491c05A82219b8D1479057361ff1654749b876b" },
      { symbol: "USDe", address: "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34" },
      { symbol: "LINK", address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4" },
    ],
  },
  [CHAIN.BSC]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "BNB", address: "native" },
      { symbol: "USDT", address: "0x55d398326f99059ff775485246999027b3197955" },
      { symbol: "USDC", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" },
      { symbol: "USDe", address: "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34" },
      { symbol: "XRP", address: "0x1d2f0da169ceb9fc7b3144628db156f3f6c60dbe" },
      { symbol: "LINK", address: "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd" },
    ],
  },
  [CHAIN.HYPERLIQUID]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "HYPE", address: "native" },
      { symbol: "USDC", address: "0xb88339CB7199b77E23DB6E890353E22632Ba630f" },
      { symbol: "LINK", address: "0x1AC2EE68b8d038C982C1E1f73F596927dd70De59" },
    ],
  },
  [CHAIN.OPTIMISM]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "ETH", address: "native" },
      { symbol: "OP", address: "0x4200000000000000000000000000000000000042" },
      { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
      { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" },
      { symbol: "USDe", address: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34" },
      { symbol: "LINK", address: "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6" },
    ],
  },
  [CHAIN.MONAD]: {
    treasury: "0x3FbB416f35929a62325705BB634Eb9C129503595",
    assets: [
      { symbol: "MON", address: "native" },
      { symbol: "USDC", address: "0x754704bc059f8c67012fed69bc8a327a5aafb603" },
      { symbol: "LINK", address: "0x76f257B1DDA5cC71bee4eF637Fbdde4C801310A9" },
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
    [CHAIN.SOLANA]: { start: "2025-01-01" },
    [CHAIN.BASE]: { start: "2025-01-01" },
    [CHAIN.POLYGON]: { start: "2025-01-01" },
    [CHAIN.ARBITRUM]: { start: "2025-01-01" },
    [CHAIN.BSC]: { start: "2025-01-01" },
    [CHAIN.HYPERLIQUID]: { start: "2025-01-01" },
    [CHAIN.OPTIMISM]: { start: "2025-01-01" },
    [CHAIN.MONAD]: { start: "2025-01-01" },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Transaction fees paid by users for fiat to crypto settlements.",
    Revenue: "Revenue represents fees collected by PagFinance from fiat to crypto settlements.",
    ProtocolRevenue: "Revenue represents fees collected by PagFinance from fiat to crypto settlements.",
  },
};

export default adapter;
