import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getETHReceived } from "../../helpers/token";

// 0x64a0ddF7469d52828a026b98A76F194637DaAd2C(ExpressLanAuction Contract)

// https://docs.kairos-timeboost.xyz/submission-api
const KAIROS_PAYMENT_ADDRESS = '0x60E6a31591392f926e627ED871e670C3e81f1AB8';

const fetchFees = async (_a, _b, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    await getETHReceived({ options, balances: dailyFees, target: KAIROS_PAYMENT_ADDRESS });

    return {
        dailyFees,
        dailyRevenue: dailyFees
    }
}

// version 1 as it's using allium query
const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: '2025-04-16'
    },
  },
  isExpensiveAdapter: true,
}

export default adapter;