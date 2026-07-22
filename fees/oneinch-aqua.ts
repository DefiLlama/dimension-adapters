import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, nullAddress } from "../helpers/token";

// 1inch DAO fee exchangers — the receivers encoded into every Aqua strategy's
// protocol-fee instruction (https://github.com/1inch/aqua). At fill time SwapVM
// transfers the DAO's share of the LP fee straight from the swap to this
// address, so ERC20 inflows here are the protocol's revenue stream. The
// exchangers were purpose-deployed for the protocol-fee launch (2026-07-18/19)
// and receive nothing else.
//
// Protocol fee is encoded into new positions by default since 2026-07-19
// (1inch DAO governance decision); the BNB Chain and Robinhood Chain
// exchangers were verified and enabled on 2026-07-21. Addresses mirror the
// 1inch dApp chain config; three chains use chain-specific deployments, the
// rest share one address.
const DEFAULT_EXCHANGER = "0x8063d4faf54bf8c898dc6ddc689c76ab12b4614a";

const chainConfig: Record<string, { exchanger: string; start: string }> = {
  [CHAIN.ETHEREUM]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-19" },
  [CHAIN.BASE]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-19" },
  [CHAIN.OPTIMISM]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-19" },
  [CHAIN.POLYGON]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-19" },
  [CHAIN.ARBITRUM]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-19" },
  [CHAIN.XDAI]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-19" },
  [CHAIN.SONIC]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-19" },
  [CHAIN.UNICHAIN]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-19" },
  [CHAIN.ERA]: {
    exchanger: "0xc0242e93dc86ab95210d6deaf8b9118fea3bde06",
    start: "2026-07-19",
  },
  [CHAIN.AVAX]: {
    exchanger: "0xa7417d51427a60d3a4629615da44d1b8698e6cf4",
    start: "2026-07-19",
  },
  [CHAIN.LINEA]: {
    exchanger: "0x0f4b0148f984320d255557a0006162af3a3c7baa",
    start: "2026-07-19",
  },
  [CHAIN.BSC]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-21" },
  [CHAIN.ROBINHOOD]: { exchanger: DEFAULT_EXCHANGER, start: "2026-07-21" },
};

// Mint transfers (from == 0x0) are excluded: the exchanger holds
// interest-bearing tokens (e.g. aTokens) whose rebase mints would otherwise
// count as fee income. Handles both log shapes: indexer entries carry a from
// field; raw fallback logs carry the sender in topics[1].
const isNotMint = (log: any): boolean => {
  const from =
    log.from ??
    log.from_address ??
    log.fromAddress ??
    log.args?.from ??
    (log.topics?.[1] ? "0x" + String(log.topics[1]).slice(-40) : "");
  return String(from).toLowerCase() !== nullAddress;
};

const fetch = async (options: FetchOptions) => {
  const inflows = await addTokensReceived({
    options,
    target: chainConfig[options.chain].exchanger,
    logFilter: isNotMint,
  });

  const dailyFees = options.createBalances();
  dailyFees.add(inflows, 'Aqua LP Swap Fees');

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
  adapter: Object.fromEntries(
    Object.entries(chainConfig).map(([chain, { start }]) => [chain, { start }]),
  ),
  methodology: {
    Fees: "The 1inch DAO's share of Aqua LP swap fees: 1/4 of the LP fee on low-fee tiers (below ~0.1225%) and 1/6 on higher tiers, encoded into each position and transferred to the DAO fee exchanger at fill time. LP-retained fees accrue inside maker-owned positions (Aqua is non-custodial) and are not yet separately measurable on-chain, so this is a lower bound on total fees; an LP-fee decode from strategy bytecode is planned as a follow-up.",
    Revenue:
      "All counted fees go to the protocol entity; equals dailyFees until LP-retained fees are measurable.",
    ProtocolRevenue:
      "ERC20 transfers received by the per-chain 1inch DAO fee-exchanger addresses, excluding mints (interest-bearing-token rebases). Inflows occur inside Aqua fill transactions.",
  },
  breakdownMethodology: {
    Fees: {
      'Aqua LP Swap Fees':
        "The DAO's encoded share of Aqua LP swap fees, transferred to the per-chain fee exchanger at fill time (the exchangers were deployed for this purpose on 2026-07-18 and receive nothing else).",
    },
    Revenue: {
      'Aqua LP Swap Fees':
        "All tracked fee-exchanger inflows are retained by the protocol entity.",
    },
    ProtocolRevenue: {
      'Aqua LP Swap Fees':
        "Fee-exchanger inflows accrue to the 1inch DAO treasury.",
    },
  },
}; 

export default adapter;