import { Balances } from "@defillama/sdk";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";
import fetchURL from "../../utils/fetchURL";
import { BIM_RPC_CHAINS, BRIDGE_SELECTOR, isRpcChain, PERFORM_ACTIONS_SELECTOR, SWAP_AND_BRIDGE_SELECTOR, SWAP_SELECTOR } from "../../aggregators/bim/config";
import { fetchBimFromRpc } from "../../aggregators/bim/rpc";

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
const oldBridgeAndSwapTarget = "0x1895108f64033F4c0A1fEd0669Adc93e7E017f3C";
const newBridgeAndSwapTarget = "0x5c6bcf885453394ea71986bb8de596c34f9a19ee";
const bridgeAndSwapTargetChangeDate = "2026-05-12";

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

// BIM buyback program: bought-back BIM is sent to this Safe on Base.
// Sample tx: 0xdd15d68d7e863a6f31773129042e6bcc0a11fe87c3aa0adfe0f03fd6369931b0
const BIM_TOKEN_BASE = "0x555fff48549c1a25a723bd8e7ed10870d82e8379";
const BIM_BUYBACK_WALLET = "0x472f31ab919ef12ccadfdd3f9ed5704397546d79";
const BIM_BUYBACK_START = "2026-02-20"; // first BIM transfer into the wallet

const getBuybacks = async (options: FetchOptions): Promise<Balances> => {
  if (options.chain !== CHAIN.BASE || options.dateString < BIM_BUYBACK_START) return options.createBalances();
  return addTokensReceived({
    options,
    token: BIM_TOKEN_BASE,
    target: BIM_BUYBACK_WALLET,
  });
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
  ...Object.fromEntries(Object.entries(BIM_RPC_CHAINS).map(([chain, { start }]) => [chain, { start }])),
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
  // chains Dune does not index: fees are read per bim tx from the chain's RPC instead
  // of the fee wallet's token transfers (never both, they cover the same wallet)
  if (isRpcChain(chain)) {
    const { dailyFees } = await fetchBimFromRpc(options, [SWAP_SELECTOR, BRIDGE_SELECTOR, SWAP_AND_BRIDGE_SELECTOR, PERFORM_ACTIONS_SELECTOR]);
    return dailyFees;
  }
  const tokens = await fetchBridgeAndSwapTokens();
  const bridgeAndSwapTarget = options.dateString >= bridgeAndSwapTargetChangeDate ? newBridgeAndSwapTarget : oldBridgeAndSwapTarget;
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
  const buybacksPromise = getBuybacks(options);
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addBalances(await stakingFeesPromise, "Staking Fees");
  dailyFees.addBalances(await dailyBridgeAndSwapFeesPromise, "Swap & Bridge Fees (EVM)");
  dailyHoldersRevenue.addBalances(await buybacksPromise, "BIM Buyback");

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: `9% of each harvest is charged as a performance fee for staking, 0.25% for every swap and 0.125% for every bridge.`,
  Revenue: `9% of each harvest is charged as a performance fee for staking, 0.25% for every swap and 0.125% for every bridge.`,
  ProtocolRevenue: `9% of each harvest is charged as a performance fee for staking, 0.25% for every swap and 0.125% for every bridge.`,
  HoldersRevenue: `BIM tokens bought back by the protocol and sent to the buyback wallet on Base.`,
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
    HoldersRevenue: {
      "BIM Buyback": "BIM tokens received by the protocol's buyback wallet on Base.",
    },
  },
};

export default adapter;
