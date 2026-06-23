/**
 * Lunar Finance — Bridge aggregator volume
 * Official Lunar Finance team · https://lunarfinance.io
 *
 * DATA SOURCE: Lunar public analytics API (confirmed bridge transactions).
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  fetchLunarAnalytics,
  LUNAR_CHAIN_ID,
  LUNAR_DEFAULT_START,
  parseLunarUsdWei,
} from "../../helpers/lunarFinance";

const fetch = async (options: FetchOptions) => {
  const res = await fetchLunarAnalytics("bridge", options);
  const payload = res.data ?? {};

  const dailyBridgeVolume = parseLunarUsdWei(
    payload.dailyBridgeVolume ?? payload.dailyVolume,
  );
  const dailyFees = parseLunarUsdWei(payload.dailyFees);
  const dailyRevenue = parseLunarUsdWei(
    payload.dailyProtocolRevenue ?? payload.dailyRevenue,
  );

  return {
    dailyBridgeVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyUserFees: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.keys(LUNAR_CHAIN_ID).map((chain) => [
      chain,
      { fetch, start: LUNAR_DEFAULT_START },
    ]),
  ),
  methodology: {
    BridgeVolume:
      "USD value of assets bridged cross-chain through Lunar Finance. Routes use LiFi, Relay, Hyperlane, Stargate, Mayan, and other bridge providers. Data from Lunar analytics API (confirmed transactions via lunarfinance.io).",
    Fees: "User-paid bridge fees including underlying provider fees.",
    Revenue: "Protocol fees retained by Lunar Finance.",
    ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
  },
};

export default adapter;
