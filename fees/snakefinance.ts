
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { getETHReceived } from "../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  await getETHReceived({
    options,
    balances: dailyFees,
    targets: ['0x7d4c78a4d8a5cbfeec4a3498885749079fab590c', '0xa906B773bf4E1F5C668EeDEed06aa8917057eA7D'],
  })
  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2025-02-15',
    },
  },
  methodology: {
    Fees: 'Total fees paid by users.',
  }
}

export default adapter;

