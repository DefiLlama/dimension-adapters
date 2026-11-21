import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetch } from "../dexs/polymarket-perps";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: async (options) => ({ openInterestAtEnd: (await fetch(options)).openInterestAtEnd }),
  runAtCurrTime: true,
  // Matching, positions, margin and funding are updated off-chain; Polygon only sees
  // deposits, withdrawals and periodic state-root commitments (docs: perps architecture),
  // so the venue is keyed as off_chain rather than Polygon.
  chains: [CHAIN.OFF_CHAIN],
}

export default adapter
