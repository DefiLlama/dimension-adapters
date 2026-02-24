import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    UserFees: "User pays a variable percentage on each swap depending on the pool. Minimum: 0.008%, maximum: 1%.",
    ProtocolRevenue: "No protocol revenue.",
    SupplySideRevenue: "LPs have no revenue.",
    HoldersRevenue: "ARX stakers receive all fees."
  },
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getUniV3LogAdapter({ factory: '0x855f2c70cf5cb1d56c15ed309a4dfefb88ed909e' }),
      start: '2023-05-09',
    },
  },
}

export default adapter;
