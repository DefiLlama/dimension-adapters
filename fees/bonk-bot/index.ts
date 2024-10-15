import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fethcFeesSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: 'ZG98FUCjb8mJ824Gbs6RsgVmr1FhXb2oNiJHa2dwmPd' })
  return { dailyFees, dailyRevenue: dailyFees, }
}


const adapter: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: 1692748800,
    },
  }
}

export default adapter;
