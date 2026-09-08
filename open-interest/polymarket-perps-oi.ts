import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetch } from "../dexs/polymarket-perps";

const adapter: SimpleAdapter = {
  version: 2,
  fetch: async (options) => ({ openInterestAtEnd: (await fetch(options)).openInterestAtEnd }),
  runAtCurrTime: true,
  chains: [CHAIN.POLYGON],
}

export default adapter
