import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, nullAddress } from "../../helpers/token";

// 1inch DAO fee exchangers — the receivers encoded into every Aqua strategy's
// protocol-fee instruction (https://github.com/1inch/aqua). At fill time SwapVM
// transfers the DAO's share of the LP fee straight from the swap to this
// address, so ERC20 inflows here are the protocol's revenue stream.
// Addresses mirror the 1inch dApp chain config; three chains use
// chain-specific deployments, the rest share one address.
const DEFAULT_EXCHANGER = "0x8063d4faf54bf8c898dc6ddc689c76ab12b4614a";

const FEE_EXCHANGER: Record<string, string> = {
  [CHAIN.ETHEREUM]: DEFAULT_EXCHANGER,
  [CHAIN.BASE]: DEFAULT_EXCHANGER,
  [CHAIN.OPTIMISM]: DEFAULT_EXCHANGER,
  [CHAIN.POLYGON]: DEFAULT_EXCHANGER,
  [CHAIN.ARBITRUM]: DEFAULT_EXCHANGER,
  [CHAIN.BSC]: DEFAULT_EXCHANGER,
  [CHAIN.XDAI]: DEFAULT_EXCHANGER,
  [CHAIN.SONIC]: DEFAULT_EXCHANGER,
  [CHAIN.UNICHAIN]: DEFAULT_EXCHANGER,
  [CHAIN.ROBINHOOD]: DEFAULT_EXCHANGER,
  [CHAIN.ERA]: "0xc0242e93dc86ab95210d6deaf8b9118fea3bde06",
  [CHAIN.AVAX]: "0xa7417d51427a60d3a4629615da44d1b8698e6cf4",
  [CHAIN.LINEA]: "0x0f4b0148f984320d255557a0006162af3a3c7baa",
};

const fetch = async (options: FetchOptions) => {
  // Mint transfers (from == 0x0) are excluded: the exchanger holds
  // interest-bearing tokens (e.g. aTokens) whose rebase mints would otherwise
  // count as fee income.
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_EXCHANGER[options.chain],
    logFilter: (log: any) =>
      String(
        log.from ?? log.from_address ?? log.fromAddress ?? log.args?.from ?? "",
      ).toLowerCase() !== nullAddress,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.BASE,
    CHAIN.OPTIMISM,
    CHAIN.POLYGON,
    CHAIN.ARBITRUM,
    CHAIN.AVAX,
    CHAIN.XDAI,
    CHAIN.LINEA,
    CHAIN.SONIC,
    CHAIN.UNICHAIN,
    CHAIN.ERA,
    [CHAIN.BSC, { start: "2026-07-21" }],
    [CHAIN.ROBINHOOD, { start: "2026-07-21" }],
  ],
  // Protocol fee is encoded into new positions by default since 2026-07-19
  // (1inch DAO governance decision; BNB Chain and Robinhood Chain exchangers
  // were verified and enabled on 2026-07-21).
  start: "2026-07-19",
  methodology: {
    Fees: "The 1inch DAO's share of Aqua LP swap fees: 1/4 of the LP fee on low-fee tiers (below ~0.1225%) and 1/6 on higher tiers, encoded into each position and transferred to the DAO fee exchanger at fill time. LP-retained fees accrue inside maker-owned positions (Aqua is non-custodial) and are not yet separately measurable on-chain, so this is a lower bound on total fees; an LP-fee decode from strategy bytecode is planned as a follow-up.",
    Revenue:
      "All counted fees go to the protocol entity; equals dailyFees until LP-retained fees are measurable.",
    ProtocolRevenue:
      "ERC20 transfers received by the per-chain 1inch DAO fee-exchanger addresses, excluding mints (interest-bearing-token rebases). Inflows occur inside Aqua fill transactions.",
  },
};

export default adapter;
