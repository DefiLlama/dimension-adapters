import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchVfatDailyUsers, VFAT_ACTIVITY_FROM, vfatChainConfig } from "../helpers/vfat";

const fetch = async (options: FetchOptions) => {
  return {
    dailyActiveUsers: await fetchVfatDailyUsers(options, "active_users"),
  };
};

const methodology = {
  ActiveUsers:
    "Sickle owner wallets with at least one executed vfat Sickle action on the chain during the UTC day. Includes owners whose only actions that day were automation they configured and pay for (compound, rebalance, harvest, exit); skipped or failed keeper attempts are not counted. Counted per chain, so a wallet active on several chains is counted once on each.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  // Owner activity is indexed from 2024-11-01; chains launched later start at their first Sickle deploy.
  adapter: Object.fromEntries(
    Object.entries(vfatChainConfig).map(([chain, { firstDay }]) => [
      chain,
      { start: firstDay > VFAT_ACTIVITY_FROM ? firstDay : VFAT_ACTIVITY_FROM },
    ]),
  ),
  methodology,
};

export default adapter;
