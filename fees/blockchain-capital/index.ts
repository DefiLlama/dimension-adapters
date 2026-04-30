import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const BCAP_TOKEN = "0x57fD71a86522Dc06D6255537521886057c1772A3";
const PRICE_FEED = "0x0eF2418216476Ab5264821070B8c24b6B458F796";
const TOKEN_DECIMALS = 2;
const REDSTONE_ORACLE_DECIMALS = 8;
const MANAGEMENT_FEE = 2.5 / 100;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

const priceFeedAbi = "function latestAnswer() view returns (int256)";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const priceBefore = await options.fromApi.call({ target: PRICE_FEED, abi: priceFeedAbi });
  const priceAfter = await options.toApi.call({ target: PRICE_FEED, abi: priceFeedAbi });

  const currentPrice = priceAfter / 10 ** REDSTONE_ORACLE_DECIMALS;
  const priceChange = (priceAfter - priceBefore) / 10 ** REDSTONE_ORACLE_DECIMALS;

  const totalSupply = await options.api.call({
    target: BCAP_TOKEN,
    abi: "function totalSupply() view returns (uint256)",
  });
  const totalSupplyAfterDecimals = totalSupply / 10 ** TOKEN_DECIMALS;

  const managementFeesForPeriod =
    (currentPrice *
      totalSupplyAfterDecimals *
      MANAGEMENT_FEE *
      (options.toTimestamp - options.fromTimestamp)) /
    ONE_YEAR_IN_SECONDS;
  const yieldForPeriod = priceChange * totalSupplyAfterDecimals;

  dailyFees.addUSDValue(managementFeesForPeriod, METRIC.MANAGEMENT_FEES);
  dailyRevenue.addUSDValue(managementFeesForPeriod, METRIC.MANAGEMENT_FEES);

  dailyFees.addUSDValue(yieldForPeriod, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.addUSDValue(yieldForPeriod, METRIC.ASSETS_YIELDS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Yields calculated from BCAP NAV change and 2.5% management fees",
  Revenue: "Includes 2.5% management fees collected by the protocol",
  ProtocolRevenue: "Includes 2.5% management fees collected by the protocol",
  SupplySideRevenue: "Yields calculated from BCAP NAV change",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Yields calculated from BCAP NAV change",
    [METRIC.MANAGEMENT_FEES]: "2.5% management fees collected by the protocol",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "2.5% management fees collected by the protocol",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "2.5% management fees collected by the protocol",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "Yields calculated from BCAP NAV change",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  breakdownMethodology,
  methodology,
  adapter: {
    [CHAIN.ERA]: {
      start: "2025-05-06",
    },
  },
  allowNegativeValue: true,
};

export default adapter;
