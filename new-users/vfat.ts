import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchVfatDailyUsers, vfatChainConfig } from "../helpers/vfat";

const fetch = async (options: FetchOptions) => {
  return {
    dailyNewUsers: await fetchVfatDailyUsers(options, "new_users"),
  };
};

const methodology = {
  NewUsers:
    "Wallets that deployed their first vfat Sickle on the chain during the UTC day. A second Sickle for an existing owner is not a new user. Counted per chain, so a wallet that starts on a second chain is new on that chain too.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: Object.fromEntries(
    Object.entries(vfatChainConfig).map(([chain, { firstDay }]) => [chain, { start: firstDay }]),
  ),
  methodology,
};

export default adapter;
