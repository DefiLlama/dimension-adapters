import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    UserFees: "User pays 0.25% fees on each swap.",
    ProtocolRevenue: "No protocol revenue.",
    SupplySideRevenue: "LPs have no revenue.",
    HoldersRevenue: "ARX stakers receive all fees."
  },
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getUniV2LogAdapter({ factory: '0x1C6E968f2E6c9DEC61DB874E28589fd5CE3E1f2c' }),
    },
  },
}

export default adapter;
