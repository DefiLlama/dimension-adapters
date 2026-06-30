/**
 * Lunar Finance — Bridge aggregator volume
 * Official Lunar Finance team · https://lunarfinance.io
 *
 * DATA SOURCE: Lunar public analytics API (confirmed bridge transactions).
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  fetchLunarAnalytics,
  LUNAR_ADAPTER_CHAINS,
  LUNAR_DEFAULT_START,
  LUNAR_PRIMARY_CHAIN,
  parseLunarUsdWei,
  resolveLunarSupplySideRevenue,
} from "../../helpers/lunarFinance";

const emptyResult = {
  dailyBridgeVolume: 0,
  dailyFees: 0,
  dailyRevenue: 0,
  dailyProtocolRevenue: 0,
  dailyUserFees: 0,
  dailySupplySideRevenue: 0,
};

const fetch = async (options: FetchOptions) => {
  if (options.chain !== LUNAR_PRIMARY_CHAIN) {
    return emptyResult;
  }

  const res = await fetchLunarAnalytics("bridge", options);
  const payload = res.data ?? {};

  const dailyBridgeVolume = parseLunarUsdWei(
    payload.dailyBridgeVolume ?? payload.dailyVolume,
  );
  const dailyFees = parseLunarUsdWei(payload.dailyFees);
  const dailyRevenue = parseLunarUsdWei(
    payload.dailyProtocolRevenue ?? payload.dailyRevenue,
  );
  const dailySupplySideRevenue = resolveLunarSupplySideRevenue(
    payload.dailySupplySideRevenue,
    dailyFees,
    dailyRevenue,
    `Lunar Finance bridge (${options.chain})`,
  );

  return {
    dailyBridgeVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
  };
};

const methodology = {
  BridgeVolume:
    "USD value of assets bridged cross-chain through Lunar Finance. Routes use LiFi, Relay, Hyperlane, Stargate, Mayan, and other bridge providers. Data from Lunar analytics API (confirmed transactions via lunarfinance.io). Protocol-wide API totals are attributed to Ethereum until the analytics API exposes per-chain breakdown.",
  Fees: "User-paid bridge fees including underlying provider fees.",
  Revenue: "Protocol fees retained by Lunar Finance.",
  ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
  SupplySideRevenue:
    "Fees paid to underlying bridge and relayer providers (total fees minus Lunar protocol revenue).",
};

const breakdownMethodology = {
  BridgeVolume: {
    "Cross-chain bridge volume":
      "USD value of confirmed bridge transactions from the Lunar analytics API.",
  },
  Fees: {
    "Bridge fees":
      "User-paid bridge fees including underlying provider fees.",
  },
  Revenue: {
    "Protocol fees": "Protocol fees retained by Lunar Finance.",
  },
  ProtocolRevenue: {
    "Treasury fees": "Fees collected by the Lunar Finance treasury.",
  },
  SupplySideRevenue: {
    "Provider fees":
      "Fees paid to underlying bridge and relayer providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    LUNAR_ADAPTER_CHAINS.map((chain) => [
      chain,
      { fetch, start: LUNAR_DEFAULT_START },
    ]),
  ),
  methodology,
  breakdownMethodology,
};

export default adapter;
