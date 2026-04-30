import { FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTradeFees, DELPHI_START, getMarketConfigs, getMarketProxies, getTrades } from "../helpers/delphi";
import { METRIC } from "../helpers/metrics";

const fetch: FetchV2 = async (options) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { buys, sells } = await getTrades(options);
  const marketProxies = getMarketProxies(buys, sells);
  const configs = await getMarketConfigs(options, marketProxies);

  addTradeFees({ dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }, buys, sells, configs);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by users when buying or selling Delphi market shares.",
  },
  Revenue: {
    "Trading Fees To Buyback Vault": "Protocol share of trading fees sent to the Delphi buyback vault.",
  },
  ProtocolRevenue: {
    "Trading Fees To Buyback Vault": "Protocol share of trading fees sent to the Delphi buyback vault.",
  },
  SupplySideRevenue: {
    "Trading Fees To Market Creator": "Creator share of Delphi market trading fees. Fees are accrued at trade time; realized payouts can differ if a market expires.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.GENSYN],
  start: DELPHI_START,
  methodology: {
    Fees: "Trading fees paid by users when buying or selling Delphi market shares.",
    Revenue: "Protocol share of trading fees sent to the Delphi buyback vault.",
    ProtocolRevenue: "Protocol share of trading fees sent to the Delphi buyback vault.",
    SupplySideRevenue: "Creator share of trading fees accrued at trade time.",
  },
  breakdownMethodology,
};

export default adapter;
