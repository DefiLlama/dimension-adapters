import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";
import fetchURL from "../../utils/fetchURL";

const tokenChainsEndpoint = "https://ugcs4scwc8wwckcc40os4oso.bim.finance/token-chains";
const bridgeAndSwapTarget = "0x1895108f64033F4c0A1fEd0669Adc93e7E017f3C";

let cachedTokens: Record<string, string[]> | null = null;

const chainIdMap: Record<number, CHAIN> = {
  1: CHAIN.ETHEREUM,
  10: CHAIN.OPTIMISM,
  56: CHAIN.BSC,
  100: CHAIN.XDAI,
  137: CHAIN.POLYGON,
  8453: CHAIN.BASE,
  9745: CHAIN.PLASMA,
  42161: CHAIN.ARBITRUM,
  999003: CHAIN.SOLANA
};

const fetchBridgeAndSwapTokens = async (): Promise<Record<string, string[]>> => {
  if (cachedTokens) return cachedTokens;
  const tokens: Record<string, string[]> = {};
  let page = 0;
  let last = false;
  const size = 100;

  while (!last) {
    const response = await fetchURL(`${tokenChainsEndpoint}?page=${page}&size=${size}`);
    for (const item of response.content) {
      const chain = chainIdMap[item.chainId];
      if (!chain) continue;
      if (!tokens[chain]) tokens[chain] = [];
      if (!tokens[chain].includes(item.address)) {
        tokens[chain].push(item.address);
      }
    }
    last = response.last;
    page++;
  }

  cachedTokens = tokens;
  return tokens;
};

const stakingTarget = "0xcc0516d2B5D8E156890D894Ee03a42BaC7176972";
const vaultsEndpoint = "https://staking-api.bim.finance/vaults";
let cachedVaults: any[] | null = null;

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
};

const fetchVaults = async (): Promise<any[]> => {
  if (cachedVaults) return cachedVaults;

  const data = await fetchURL(vaultsEndpoint);
  if (!data || !data.length || data == null || data == undefined) {
    throw new Error("No vault data found");
  }

  cachedVaults = data;

  return data;
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

const getStakingFees = async (options: FetchOptions): Promise<any> => {
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
  const stakingFeesPromise = getStakingFees(options);
  const dailyBridgeAndSwapFeesPromise = getBridgeAndSwapFees(options);
  const dailyFees = await stakingFeesPromise;
  dailyFees.addBalances(await dailyBridgeAndSwapFeesPromise);

  return {
    dailyFees: dailyFees || 0,
    dailyRevenue: dailyFees || 0,
  };
};

const methodology = {
  Fees: `9% of each harvest is charged as a performance fee for staking and between 0.25% and 0.125% depending on how much BIM is held is charged for every swap or bridge.`,
  Revenue: `9% of each harvest is charged as a performance fee for staking and between 0.25% and 0.125% depending on how much BIM is held is charged for every swap or bridge.`,
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: baseAdapter,
  methodology,
};

export default adapter;