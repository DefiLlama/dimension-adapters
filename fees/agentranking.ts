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
import { getConfig } from "../helpers/cache";

const EXPORT_URL = "https://agentranking.io/api/public/defillama/fees";
const FALLBACK_SOLANA_TREASURY = "J5QG8T3vqCSmFhE92VBwtHCQnAphzZynZAccBCP8iqqc";
const WSOL = ADDRESSES.solana.SOL;
const AR_MINT = "92eXvBFGBAXwgmPf6t6CUCNJH2xChsCJuWzaGPjyPUmP";

const FEES_DISTRIBUTED =
  "event FeesDistributed(address indexed token, address indexed creator, address indexed arTreasury, uint256 creatorAmount, uint256 arAmount)";

const LABEL_PUMP_CREATOR_SHARE = "Pump Creator-Fee Share";
const LABEL_LAUNCHPAD_FEES = "Launchpad Fees";
const LABEL_SPLITTER_PROTOCOL = "Launchpad Fees To AgentRanking";
const LABEL_SPLITTER_CREATOR = "Launchpad Fees To Creators";

async function prefetch(): Promise<any> {
  return getConfig('agentranking', EXPORT_URL);
}

async function fetchSolana(options: FetchOptions) {
  const data = options.preFetchedResults;
  const treasury = data.chains?.solana?.treasury || FALLBACK_SOLANA_TREASURY;
  const received = options.createBalances();
  await getSolanaReceived({
    options,
    balances: received,
    target: treasury,
    mints: [WSOL],
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
    dailySupplySideRevenue: 0,
  };
}

async function fetchRobinhood(options: FetchOptions) {
  const data = options.preFetchedResults;
  const splitters = (data.chains?.robinhood?.splitters || []).filter(Boolean);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const weth = ADDRESSES.robinhood.WETH;

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
      dailyFees.add(token, log.arAmount, LABEL_LAUNCHPAD_FEES);
      dailyRevenue.add(token, log.arAmount, LABEL_SPLITTER_PROTOCOL);
    }
    if (log.creatorAmount && log.creatorAmount !== "0") {
      dailyFees.add(token, log.creatorAmount, LABEL_LAUNCHPAD_FEES);
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

async function fetch(options: FetchOptions) {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
  return fetchRobinhood(options);
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
    [LABEL_LAUNCHPAD_FEES]:
      "Robinhood — 30% of swept creator LP fees sent to the AgentRanking treasury and 70% to token creators",
  },
  Revenue: {
    [LABEL_PUMP_CREATOR_SHARE]: "Solana platform share retained by AgentRanking.",
    [LABEL_SPLITTER_PROTOCOL]: "Robinhood platform share(30%) retained by AgentRanking.",
  },
  ProtocolRevenue: {
    [LABEL_PUMP_CREATOR_SHARE]: "Solana platform share retained by AgentRanking.",
    [LABEL_SPLITTER_PROTOCOL]: "Robinhood platform share(30%) retained by AgentRanking.",
  },
  SupplySideRevenue: {
    [LABEL_SPLITTER_CREATOR]: "Robinhood creator share(70%) of splitter sweeps.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  prefetch,
  fetch,
  adapter: {
    [CHAIN.SOLANA]: { start: "2026-07-01" },
    [CHAIN.ROBINHOOD]: { start: "2026-07-15" },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  doublecounted: true,
};

export default adapter;
