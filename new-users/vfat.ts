import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchVfatDailyUsers } from "../helpers/vfat";

// A wallet is new only on its first Sickle deploy on any chain, so the count is reported for
// chain_global (API chainId 0, owners deduplicated across all chains) with no per-chain split.
const fetch = async (options: FetchOptions) => {
  return {
    dailyNewUsers: await fetchVfatDailyUsers(options, 0, "new_users"),
  };
};

const methodology = {
  NewUsers:
    "Wallets that deployed their first vfat Sickle on any supported chain during the UTC day. A second Sickle, or a first Sickle on another chain, for a wallet that already uses vfat is not a new user.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CHAIN_GLOBAL],
  // First Sickle deploy on any chain (the API's all-chain first_day).
  start: "2022-12-30",
  methodology,
};

export default adapter;
