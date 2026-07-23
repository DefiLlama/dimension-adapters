import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    UserFees:
      "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
    SupplySideRevenue: "LPs receive 36% of the current swap fee",
    ProtocolRevenue: "Treasury receives 64% of each swap",
    Fees: "All fees come from the user.",
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch: getUniV3LogAdapter({ factory: '0x38015d05f4fec8afe15d7cc0386a126574e8077b', revenueRatio: 0.64 }),
      start: '2023-07-28',
    },
  },
};

export default adapter;
