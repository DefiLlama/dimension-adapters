import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const adapter: SimpleAdapter = {
  fetch: async () => {return {}},
  chains: [CHAIN.DOGECHAIN],
  start: 1630000000,
}

export default adapter;
