import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CONFLUENCE_CHAINS, CONFLUENCE_START, confluenceChainDay, fetchConfluenceDay } from "../../helpers/confluence";

const fetch = async (options: FetchOptions) => {
  const c = confluenceChainDay(options);
  const dailyBridgeVolume = options.createBalances();
  if (c) {
    // CCTP bridges move native USDC (1 USDC = 1 USD); Relay reports the USD value of each route.
    dailyBridgeVolume.addUSDValue(Number(c.bridge.volumeUsdc ?? 0));
    dailyBridgeVolume.addUSDValue(c.relayBridge?.volumeUsd ?? 0);
  }
  return { dailyBridgeVolume };
};

const methodology = {
  BridgeVolume:
    "Value bridged through Confluence on the source chain, from Confluence's public stats API: USDC sent with Circle CCTP (counted once Circle's attestation data confirms the burn) plus the USD value of cross-chain routes executed through Relay that Relay reported as successful. Same-chain swaps, Arc to Arc payments and fees are not included.",
};


const adapter: SimpleAdapter = {
  version: 1,
  prefetch: fetchConfluenceDay,
  fetch,
  chains: Object.values(CONFLUENCE_CHAINS),
  start: CONFLUENCE_START,
  methodology,
};

export default adapter;
