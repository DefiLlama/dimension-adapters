import { Balances } from "@defillama/sdk";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";
import fetchURL from "../../utils/fetchURL";

const STELLAR_SWAP_URL = "https://defillama-data.bim.finance/swap";
const STELLAR_BRIDGE_URL = "https://defillama-data.bim.finance/bridge";

const fetchStellarFees = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const [swapData, bridgeData] = await Promise.all([
    fetchURL(`${STELLAR_SWAP_URL}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`),
    fetchURL(`${STELLAR_BRIDGE_URL}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`),
  ]);
  const dailyFees = options.createBalances();
  if (swapData.fees?.USDC) { const v = Number(swapData.fees.USDC); if (Number.isFinite(v)) dailyFees.addCGToken("usd-coin", v, "Swap Fees (Stellar)"); }
  if (swapData.fees?.XLM) { const v = Number(swapData.fees.XLM); if (Number.isFinite(v)) dailyFees.addCGToken("stellar", v, "Swap Fees (Stellar)"); }
  if (bridgeData.fees?.USDC) { const v = Number(bridgeData.fees.USDC); if (Number.isFinite(v)) dailyFees.addCGToken("usd-coin", v, "Bridge Fees (Stellar)"); }
  if (bridgeData.fees?.XLM) { const v = Number(bridgeData.fees.XLM); if (Number.isFinite(v)) dailyFees.addCGToken("stellar", v, "Bridge Fees (Stellar)"); }
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const tokenChainsEndpoint = "https://ugcs4scwc8wwckcc40os4oso.bim.finance/token-chains";
const bridgeAndSwapTarget = "0x1895108f64033F4c0A1fEd0669Adc93e7E017f3C";

let cachedTokensPromise: Promise<Record<string, string[]>> | null = null;

const chainIdMap: Record<number, CHAIN> = {
  1: CHAIN.ETHEREUM,
  10: CHAIN.OPTIMISM,
  56: CHAIN.BSC,
  100: CHAIN.XDAI,
  137: CHAIN.POLYGON,
  8453: CHAIN.BASE,
  9745: CHAIN.PLASMA,
  42161: CHAIN.ARBITRUM,
};

const fetchBridgeAndSwapTokens = (): Promise<Record<string, string[]>> => {
  if (!cachedTokensPromise) {
    cachedTokensPromise = (async () => {
      const tokens: Record<string, string[]> = {};
      const size = 100;

      const processPage = (response: any) => {
        for (const item of response.content) {
          const chain = chainIdMap[item.chainId];
          if (!chain) continue;
          if (!tokens[chain]) tokens[chain] = [];
          tokens[chain].push(item.address);
        }
      };

      const firstPage = await fetchURL(`${tokenChainsEndpoint}?page=0&size=${size}`);
      processPage(firstPage);

      if (!firstPage.last) {
        const remaining = Array.from({ length: firstPage.totalPages - 1 }, (_, i) =>
          fetchURL(`${tokenChainsEndpoint}?page=${i + 1}&size=${size}`)
        );
        const pages = await Promise.all(remaining);
        pages.forEach(processPage);
      }

      return tokens;
    })().catch((e) => {
      cachedTokensPromise = null;
      throw e;
    });
  }
  return cachedTokensPromise;
};

const stakingTarget = "0xcc0516d2B5D8E156890D894Ee03a42BaC7176972";
const vaultsEndpoint = "https://staking-api.bim.finance/vaults";
let cachedVaultsPromise: Promise<any[]> | null = null;

type ChainConfigType = {
  tokens: string[];
  target: string;
  name: string;
};

const chainConfig: Partial<Record<CHAIN, ChainConfigType>> = {
  [CHAIN.OPTIMISM]: {
    target: stakingTarget,
    tokens: [ADDRESSES.optimism.WETH],
    name: "optimism",
  },
  [CHAIN.PLASMA]: {
    target: stakingTarget,
    tokens: [ADDRESSES.plasma.WXPL],
    name: "plasma",
  },
  [CHAIN.XDAI]: {
    target: stakingTarget,
    tokens: [ADDRESSES.xdai.WXDAI],
    name: "gnosis",
  },
  [CHAIN.BASE]: {
    target: stakingTarget,
    tokens: [ADDRESSES.base.WETH],
    name: "base",
  },
  [CHAIN.POLYGON]: {
    target: stakingTarget,
    tokens: [ADDRESSES.polygon.WMATIC_2],
    name: "polygon",
  },
  [CHAIN.ARBITRUM]: {
    target: stakingTarget,
    tokens: [ADDRESSES.arbitrum.WETH],
    name: "arbitrum",
  },
  [CHAIN.BSC]: {
    target: stakingTarget,
    tokens: [ADDRESSES.bsc.WBNB],
    name: "bsc",
  },
  [CHAIN.ETHEREUM]: {
    target: stakingTarget,
    tokens: [ADDRESSES.ethereum.WETH, "0xba3f535bbcccca2a154b573ca6c5a49baae0a3ea"],
    name: "ethereum",
  },
};

const baseAdapter: BaseAdapter = {
  [CHAIN.OPTIMISM]: {
    start: "2024-10-21",
  },
  [CHAIN.XDAI]: {
    start: "2024-10-21",
  },
  [CHAIN.BASE]: {
    start: "2024-10-21",
  },
  [CHAIN.POLYGON]: {
    start: "2024-10-21",
  },
  [CHAIN.ARBITRUM]: {
    start: "2024-10-21",
  },
  [CHAIN.BSC]: {
    start: "2024-10-21",
  },
  [CHAIN.ETHEREUM]: {
    start: "2024-10-21",
  },
  [CHAIN.PLASMA]: {
    start: "2025-10-25",
  },
  [CHAIN.STELLAR]: {
    start: "2026-04-19",
  },
};

const fetchVaults = (): Promise<any[]> => {
  if (!cachedVaultsPromise) {
    cachedVaultsPromise = (async () => {
      const data = await fetchURL(vaultsEndpoint);
      if (!data || !data.length) {
        throw new Error("No vault data found");
      }
      return data;
    })().catch((e) => {
      cachedVaultsPromise = null;
      throw e;
    });
  }
  return cachedVaultsPromise;
};

const getStakingFromAddresses = async (chain: CHAIN): Promise<string[]> => {
  const config = chainConfig[chain];
  if (!config) {
    return [];
  }
  const chainVaults = await fetchVaults();
  const fromAddresses = chainVaults
    .filter((vault: { chain: string }) => vault.chain === config.name)
    .map((vault: { strategy: string }) => vault.strategy);
  return fromAddresses;
};

const getStakingFees = async (options: FetchOptions): Promise<Balances> => {
  const { chain } = options;
  const config = chainConfig[chain as CHAIN];
  if (!config) {
    return options.createBalances();
  }
  const { target, tokens } = config;
  const stakingFromAddresses = await getStakingFromAddresses(chain as CHAIN);
  return await addTokensReceived({
    options,
    tokens: tokens,
    target,
    fromAdddesses: stakingFromAddresses,
  });
};

const getBridgeAndSwapFees = async (options: FetchOptions): Promise<any> => {
  const { chain } = options;
  const tokens = await fetchBridgeAndSwapTokens();
  return addTokensReceived({
    options,
    target: bridgeAndSwapTarget,
    tokens: tokens[chain] || [],
  });
};

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.STELLAR) return fetchStellarFees(options);
  const stakingFeesPromise = getStakingFees(options);
  const dailyBridgeAndSwapFeesPromise = getBridgeAndSwapFees(options);
  const dailyFees = options.createBalances();
  dailyFees.addBalances(await stakingFeesPromise, "Staking Fees");
  dailyFees.addBalances(await dailyBridgeAndSwapFeesPromise, "Swap & Bridge Fees (EVM)");

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: `9% of each harvest is charged as a performance fee for staking, 0.25% for every swap and 0.125% for every bridge.`,
  Revenue: `9% of each harvest is charged as a performance fee for staking, 0.25% for every swap and 0.125% for every bridge.`,
  ProtocolRevenue: `9% of each harvest is charged as a performance fee for staking, 0.25% for every swap and 0.125% for every bridge.`,
};

const feesBreakdown = {
  "Swap & Bridge Fees (EVM)": "Fee charged on swaps and bridges on EVM chains (0.25% for swaps, 0.125% for bridges).",
  "Swap Fees (Stellar)": "Fee charged in USDC, XLM on Stellar swaps (0.25%).",
  "Bridge Fees (Stellar)": "Fee charged in USDC, XLM on Stellar bridges (0.125%).",
  "Staking Fees": "Fee charged on staking (9% of each harvest).",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: baseAdapter,
  methodology,
  breakdownMethodology: {
    Fees: feesBreakdown,
    Revenue: feesBreakdown,
    ProtocolRevenue: feesBreakdown,
  },
};

export default adapter;