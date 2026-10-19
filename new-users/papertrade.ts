import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Every account gets one CREATE2 deposit proxy, deployed by the protocol's keeper when the account's first deposit lands
// (https://docs.papertrade.xyz/#/how/deposits). One ProxyDeployed event per account, so it reads straight as new users and,
// unlike the protocol API's hourly series (about a week of history), can be refilled for any window.
const DEPOSIT_PROXY_FACTORY = "0x1629b7d46bef6e13ff754174fc9f32dea309b38f"; // HyperEVM
const PROXY_DEPLOYED = "event ProxyDeployed(address indexed user, address indexed proxy)";

const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({ target: DEPOSIT_PROXY_FACTORY, eventAbi: PROXY_DEPLOYED, onlyArgs: true });
  return { dailyNewUsers: new Set(logs.map((log: any) => log.user.toLowerCase())).size };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-10-06", // first accounts funded 2026-10-07; one day earlier because refill windows begin a second before the day
  methodology: {
    NewUsers: "Accounts that funded a Papertrade trading balance for the first time, counted from the deposit proxy factory's ProxyDeployed events on HyperEVM (one proxy per account, deployed on its first deposit).",
  },
};

export default adapter;
