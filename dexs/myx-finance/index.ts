import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getFetch } from "./helpers.";

const methodology = {
  Volume: "Sum of the open/close/liquidation of positions tracked from settlement contracts.",
}

const adapter: SimpleAdapter = {
  methodology,
  version: 2,
  fetch: getFetch('volume'),
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2024-01-31', },
    [CHAIN.LINEA]: { start: '2024-02-21', },
    [CHAIN.BSC]: { start: '2025-03-16', },
  }
}

export default adapter;
