import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Hyperbeat Liquid Bank ManagementAccountFactory on HyperEVM. Each AccountCreated
// event is one new Liquid Bank account, so daily new users = number of accounts
// created in the period.
const FACTORY = "0x71BE1Fa6885c0804c7402749cC73672Fb09cB36b";
const ACCOUNT_CREATED = "event AccountCreated(address indexed account, address indexed owner)";

const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({ target: FACTORY, eventAbi: ACCOUNT_CREATED });
  return { dailyNewUsers: logs.length };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2025-12-22",
};

export default adapter;
