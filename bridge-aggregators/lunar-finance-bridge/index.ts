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
  parseLunarUsdWei,
  resolveLunarSupplySideRevenue,
} from "../../helpers/lunarFinance";

const LABELS = {
  BRIDGE_FEES: "Bridge Fees",
  PROTOCOL_FEES: "Bridge Fees to Protocol",
  PROVIDER_FEES: "Bridge Fees to Providers",
}

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const res = await fetchLunarAnalytics("bridge", options);
  const payload = res.data ?? {};

  const bridgeVolume = parseLunarUsdWei(
    payload.dailyBridgeVolume ?? payload.dailyVolume,
  );
  const fees = parseLunarUsdWei(payload.dailyFees);
  const revenue = parseLunarUsdWei(
    payload.dailyProtocolRevenue ?? payload.dailyRevenue,
  );
  const supplySideRevenue = resolveLunarSupplySideRevenue(
    payload.dailySupplySideRevenue,
    fees,
    revenue,
    `Lunar Finance bridge (${options.chain})`,
  );

  if (bridgeVolume > 0) {
    dailyBridgeVolume.addUSDValue(bridgeVolume);
  }
  if (fees > 0) {
    dailyFees.addUSDValue(fees, LABELS.BRIDGE_FEES);
    dailyUserFees.addUSDValue(fees, LABELS.BRIDGE_FEES);
  }
  if (revenue > 0) {
    dailyRevenue.addUSDValue(revenue, LABELS.PROTOCOL_FEES);
    dailyProtocolRevenue.addUSDValue(revenue, LABELS.PROTOCOL_FEES);
  }
  if (supplySideRevenue > 0) {
    dailySupplySideRevenue.addUSDValue(supplySideRevenue, LABELS.PROVIDER_FEES);
  }

  return {
    dailyBridgeVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyUserFees,
    dailySupplySideRevenue,
  };
};

const methodology = {
  BridgeVolume:
    "USD value of assets bridged cross-chain through Lunar Finance, attributed to the source chain. Routes use LiFi, Relay, Hyperlane, Stargate, Mayan, and other bridge providers. Data from the Lunar analytics API (confirmed transactions via lunarfinance.io), filtered per source chain and time window.",
  Fees: "User-paid bridge fees including underlying provider fees.",
  Revenue: "Protocol fees retained by Lunar Finance.",
  ProtocolRevenue: "Fees collected by the Lunar Finance treasury.",
  SupplySideRevenue:
    "Fees paid to underlying bridge and relayer providers (total fees minus Lunar protocol revenue).",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.BRIDGE_FEES]: "User-paid bridge fees including underlying provider fees.",
  },
  UserFees: {
    [LABELS.BRIDGE_FEES]: "User-paid bridge fees including underlying provider fees.",
  },
  Revenue: {
    [LABELS.PROTOCOL_FEES]: "Protocol fees retained by Lunar Finance.",
  },
  ProtocolRevenue: {
    [LABELS.PROTOCOL_FEES]: "Protocol fees retained by Lunar Finance.",
  },
  SupplySideRevenue: {
    [LABELS.PROVIDER_FEES]: "Fees paid to underlying bridge and relayer providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: LUNAR_DEFAULT_START,
  chains: LUNAR_ADAPTER_CHAINS,
  methodology,
  breakdownMethodology,
};

export default adapter;
