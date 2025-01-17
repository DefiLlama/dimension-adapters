import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";
import { addTokensReceived } from "../helpers/token";
import moment from "moment";

const GOPLUS_FOUNDATION = "0x34ebddd30ccbd3f1e385b41bdadb30412323e34f";
const GOPLUS_REVENUE_POOL = "0x648d7f4ad39186949e37e9223a152435ab97706c";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const totalFees = options.createBalances();

  await addTokensReceived({ balances: dailyFees, target: GOPLUS_FOUNDATION, options, })
  await addTokensReceived({ balances: dailyFees, target: GOPLUS_REVENUE_POOL, options, })

  let startDate = new Date();
  startDate.setTime(options.startTimestamp * 1000);
  let start = moment(startDate).format("YYYY-MM-DD hh:mm:ss");
  const values = await queryDune("4581834", {
    end: start
  })
  values.forEach((e: { contract_address: string; amount_raw: string; }) => {
    totalFees.add(e.contract_address, e.amount_raw);
  });

  return { dailyFees, totalFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, totalProtocolRevenue: totalFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: '2024-03-06',
      meta: {
        methodology: {
            ProtocolRevenue: "The revenue of the agreement comes from users purchasing security services, and the total cost equals the revenue.",
            Fees: "All fees comes from users for security service provided by GoPlus Network."
        }
      }
    },
  },
};

export default adapter;
