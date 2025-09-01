import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetch } from "./seaport";

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Trading fees collected from Seaport-based NFT marketplaces on Immutable zkEVM orderbook",
    Revenue: "Portion of fees going to protocol fee collectors"
  },
  version: 2,
  adapter: {
    [CHAIN.IMX]: {
      fetch,
      start: '2023-12-01', // Approximate start date when Immutable zkEVM launched
    }
  }
}

export default adapter; 