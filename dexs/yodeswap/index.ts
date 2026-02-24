import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const adapter: SimpleAdapter = {
  fetch: async () => {return {}},
  chains: [CHAIN.DOGECHAIN],
  start: 1630000000,
  deadFrom: "2024-03-26",
}

export default adapter;
