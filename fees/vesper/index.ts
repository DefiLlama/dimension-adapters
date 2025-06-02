import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const VSP_TOKEN = "0x1b40183EFB4Dd766f11bda7a7c3ad8982e998421";
const DISTRIBUTOR = "0xd31f42cf356e02689d1720b5ffaa6fc7229d255b";

const fetch = async (options: FetchOptions) => {

    const dailyHoldersRevenue = await addTokensReceived({ options, tokens: [VSP_TOKEN], targets: [DISTRIBUTOR], });

  return {
    dailyFees: 0,
    dailyRevenue: 0,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1691558400, // Aug 9, 2023
      meta: {
        methodology: {
          Fees: "Not currently tracked, coming soon.",
          Revenue: "Not currently tracked, coming soon.",
          Holders: "Tracks VSP deposited into the distributor contract that is distributed to lockers.",
        },
      },
    },
  },
};

export default adapter;