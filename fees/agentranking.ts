/**
 * DefiLlama fees adapter — AgentRanking Launchpad
 *
 * Not TVL. Liquidity sits in Pump.fun / Uniswap; Llama rejected attributing that
 * (DefiLlama-Adapters#20131). This adapter counts protocol fees only.
 *
 * Solana: WSOL received by the AgentRanking launch-fee treasury (30% Pump
 * creator-fee share on AgentRanking-indexed launches).
 * Robinhood Chain: FeesDistributed on AgentRanking creator fee-splitters
 * (70% creator / 30% AgentRanking). Not Quiver factory fees.
 *
 * Logo: https://agentranking.io/logo-icon.png (512×512 square robot mark)
 * Export: https://agentranking.io/api/public/defillama/fees
 * Site: https://agentranking.io
 * Twitter: https://x.com/agentranking
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

const EXPORT_URL = "https://agentranking.io/api/public/defillama/fees";
const FALLBACK_SOLANA_TREASURY = "J5QG8T3vqCSmFhE92VBwtHCQnAphzZynZAccBCP8iqqc";
const WSOL = "So11111111111111111111111111111111111111112";
const AR_MINT = "92eXvBFGBAXwgmPf6t6CUCNJH2xChsCJuWzaGPjyPUmP";

const FEES_DISTRIBUTED =
  "event FeesDistributed(address indexed token, address indexed creator, address indexed arTreasury, uint256 creatorAmount, uint256 arAmount)";

const LABEL_PUMP_CREATOR_SHARE = "Pump Creator-Fee Share";
const LABEL_SPLITTER_PROTOCOL = "Launchpad Fees To AgentRanking";
const LABEL_SPLITTER_CREATOR = "Launchpad Fees To Creators";

type FeesExport = {
  chains?: {
    solana?: { treasury?: string; wsol?: string; blacklistMints?: string[] };
    robinhood?: { treasury?: string; weth?: string; splitters?: string[] };
  };
};

let cachedExport: { at: number; data: FeesExport } | null = null;

async function loadExport(): Promise<FeesExport> {
  const now = Date.now();
  if (cachedExport && now - cachedExport.at < 10 * 60 * 1000) return cachedExport.data;
  try {
    const res = await globalThis.fetch(EXPORT_URL);
    if (!res.ok) return {};
    const data = (await res.json()) as FeesExport;
    cachedExport = { at: now, data };
    return data;
  } catch {
    return {};
  }
}

async function collectSolana(options: FetchOptions) {
  const data = await loadExport();
  const treasury = data.chains?.solana?.treasury || FALLBACK_SOLANA_TREASURY;
  const received = options.createBalances();
  await getSolanaReceived({
    options,
    balances: received,
    target: treasury,
    mints: [data.chains?.solana?.wsol || WSOL],
    blacklist_mints: data.chains?.solana?.blacklistMints || [AR_MINT],
  });
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(received, LABEL_PUMP_CREATOR_SHARE);
  const dailyFees = options.createBalances();
  dailyFees.addBalances(received, LABEL_PUMP_CREATOR_SHARE);
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

async function collectRobinhood(options: FetchOptions) {
  const data = await loadExport();
  const splitters = (data.chains?.robinhood?.splitters || []).filter(Boolean);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const weth = data.chains?.robinhood?.weth || ADDRESSES.robinhood?.WETH;

  if (splitters.length === 0) {
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  }

  const logs = await options.getLogs({
    targets: splitters,
    eventAbi: FEES_DISTRIBUTED,
  });

  for (const log of logs) {
    const token = log.token || weth;
    if (log.arAmount && log.arAmount !== "0") {
      dailyFees.add(token, log.arAmount, LABEL_SPLITTER_PROTOCOL);
      dailyRevenue.add(token, log.arAmount, LABEL_SPLITTER_PROTOCOL);
    }
    if (log.creatorAmount && log.creatorAmount !== "0") {
      dailyFees.add(token, log.creatorAmount, LABEL_SPLITTER_CREATOR);
      dailySupplySideRevenue.add(token, log.creatorAmount, LABEL_SPLITTER_CREATOR);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

async function collect(options: FetchOptions) {
  if (options.chain === CHAIN.SOLANA) return collectSolana(options);
  return collectRobinhood(options);
}

const methodology = {
  Fees:
    "Solana: WSOL received by the AgentRanking launch-fee treasury (30% Pump creator-fee share). Robinhood: FeesDistributed on AgentRanking 70/30 creator fee-splitters (creatorAmount + arAmount). Does not count Pump/Uniswap/Quiver TVL.",
  Revenue:
    "AgentRanking's 30% platform share — Solana treasury WSOL inflows and Robinhood FeesDistributed.arAmount.",
  ProtocolRevenue:
    "Same as Revenue. AgentRanking treasury share of launchpad creator fees.",
  SupplySideRevenue:
    "Robinhood only: FeesDistributed.creatorAmount (70% to token creators). Solana creator cuts never hit the AgentRanking treasury.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_PUMP_CREATOR_SHARE]:
      "Solana — WSOL received by the launch-fee treasury from Pump creator-fee sharing.",
    [LABEL_SPLITTER_PROTOCOL]:
      "Robinhood — 30% of swept creator LP fees sent to the AgentRanking treasury.",
    [LABEL_SPLITTER_CREATOR]:
      "Robinhood — 70% of swept creator LP fees sent to token creators.",
  },
  Revenue: {
    [LABEL_PUMP_CREATOR_SHARE]: "Solana platform share retained by AgentRanking.",
    [LABEL_SPLITTER_PROTOCOL]: "Robinhood platform share retained by AgentRanking.",
  },
  ProtocolRevenue: {
    [LABEL_PUMP_CREATOR_SHARE]: "Solana platform share retained by AgentRanking.",
    [LABEL_SPLITTER_PROTOCOL]: "Robinhood platform share retained by AgentRanking.",
  },
  SupplySideRevenue: {
    [LABEL_SPLITTER_CREATOR]: "Robinhood creator share of splitter sweeps.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch: collect,
  adapter: {
    [CHAIN.SOLANA]: { start: "2026-07-01" },
    [CHAIN.ROBINHOOD]: { start: "2026-07-15" },
  },
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
