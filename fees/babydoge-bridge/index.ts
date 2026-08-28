import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const API_BASE = "https://axelar-bridge-connector-backend-main.babybulldog.xyz/lama-api";
const API_TON = "https://defillama-bsc-ton-bridge-backend-main.babybulldog.xyz";
const API_SOL = "https://wormhole-bridge-defilama-connector-backend-main.babybulldog.xyz";

const chainIds: Record<string, string> = {
  [CHAIN.BSC]: "56",
  [CHAIN.SOLANA]: "sol_mainnet_beta",
  [CHAIN.BASE]: "8453",
  [CHAIN.TON]: "ton_0",
};

const apis: Record<string, string[]> = {
  [CHAIN.BSC]: [API_BASE, API_TON, API_SOL],
  [CHAIN.SOLANA]: [API_SOL],
  [CHAIN.BASE]: [API_BASE],
  [CHAIN.TON]: [API_TON],
};

const fetch = async ({ chain, createBalances }: FetchOptions) => {
  const chainId = chainIds[chain];
  const apiList = apis[chain];

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  for (const api of apiList) {
    const data = await httpGet(`${api}/fees?chain_id=${chainId}`);
    if (data.dailyFees) {
      dailyFees.addUSDValue(data.dailyFees, "Bridge fees");
    }
    if (data.dailyRevenue) {
      dailyRevenue.addUSDValue(data.dailyRevenue, "Bridge fees");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
  };
};

const methodology = {
  Fees: "Fees paid by users for bridging assets cross-chain via BabyDoge Bridge",
  Revenue: "Protocol fees retained by BabyDoge Bridge from bridging operations"
};

const breakdownMethodology = {
  Fees: {
    "Bridge fees": "Fees charged to users for cross-chain asset transfers via BabyDoge Bridge, including transfers via Axelar, Wormhole, and BSC-TON bridges"
  },
  Revenue: {
    "Bridge fees": "Portion of bridge fees retained by the BabyDoge Bridge protocol"
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  runAtCurrTime: true,
  adapter: {
    [CHAIN.BSC]: { start: "2024-01-01" },
    [CHAIN.SOLANA]: { start: "2024-01-01" },
    [CHAIN.TON]: { start: "2024-01-01" },
    [CHAIN.BASE]: { start: "2024-01-01" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;


