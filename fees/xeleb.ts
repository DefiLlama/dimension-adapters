import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const TOKEN = "0xE32f9e8F7f7222fcd83EE0fC68bAf12118448Eaf";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const PADDED_DEAD =
  "0x000000000000000000000000000000000000000000000000000000000000dead";

const fetchFees = async ({ getLogs, createBalances }: FetchOptions) => {
  const balances = createBalances();

  const burnedLogs = await getLogs({
    target: TOKEN,
    topics: [TRANSFER_TOPIC, null, PADDED_DEAD] as any,
  });

  burnedLogs.forEach((log: any) => {
    balances.add(TOKEN, Number(log.data));
  });

  return {
    dailyFees: balances,
    dailyRevenue: balances,
    dailyProtocolRevenue: balances,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: 59020532,
    },
  },
  methodology: {
    Fees: "Users pay fees in ERC20 token which are burned by transferring to 0xdead.",
    Revenue: "All burned tokens are considered protocol revenue.",
  },
};

export default adapter;
