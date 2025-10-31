import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const GOPLUS_FOUNDATION = "0x34ebddd30ccbd3f1e385b41bdadb30412323e34f";
const GOPLUS_REVENUE_POOL = "0x648d7f4ad39186949e37e9223a152435ab97706c";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await addTokensReceived({ balances: dailyFees, target: GOPLUS_FOUNDATION, options, })
  await addTokensReceived({ balances: dailyFees, target: GOPLUS_REVENUE_POOL, options, })

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: '2024-03-06',
    },
  },
  methodology: {
    ProtocolRevenue: "The revenue of the agreement comes from users purchasing security services, and the total cost equals the revenue.",
    Fees: "All fees comes from users for security service provided by GoPlus Network."
  }
};

export default adapter;
