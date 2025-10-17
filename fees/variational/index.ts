import {
  FetchOptions,
  SimpleAdapter,
  FetchResultV2,
} from "../../adapters/types.ts";
import { CHAIN } from "../../helpers/chains.ts";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token.ts";

const FeeCollectorAddress = "0xc47756133753280c37B227C24782984E021c4544";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {

  const dailyFees = await addTokensReceived({ options, tokens: [ADDRESSES.arbitrum.USDC_CIRCLE], targets: [FeeCollectorAddress] });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
    },
  },
  methodology: {
    Fees: "flat fee of $0.1 per deposit/withdraw to disincentivize spam and cover gas costs",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  },
};

export default adapter;
