import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const chainConfig: Record<string, { start: string; yield: string }> = {
  [CHAIN.ETHEREUM]: {
    yield: "0xb82b080791dFA4aa6Cac8c3f9c0fcb4471C9FEaD",
    start: "2025-08-20",
  },
};

const DISTRIBUTE_YIELD_EVENT =
  "event DistributeYield(address caller, address indexed asset, address indexed receiver, uint256 amount, uint256 feeAmount, bool profit)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: chainConfig[options.chain].yield,
    eventAbi: DISTRIBUTE_YIELD_EVENT,
  });

  logs.forEach((log) => {
    const sign = log.profit ? 1n : -1n;

    // count all fees from yields
    dailyFees.add(log.asset, (log.amount + log.feeAmount) * sign, METRIC.ASSETS_YIELDS);

    // breakdown yields to stakers
    dailySupplySideRevenue.add(log.asset, log.amount * sign, 'Assets Yields To Stakers');

    // breakdown performance fees
    dailyRevenue.add(log.asset, log.feeAmount * sign, METRIC.PERFORMANCE_FEES);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Net yield distributed, including holder yield and treasury performance fees.",
  Revenue: "Performance fees minted to or burned from the AFI treasury.",
  ProtocolRevenue: "Performance fees minted to or burned from the AFI treasury.",
  SupplySideRevenue: "Net yield credited to afiUSD holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "All staking yield credited to afiUSD holders + share to AFI protocol.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Treasury performance fees from afiUSD yield distributions.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Treasury performance fees from afiUSD yield distributions.",
  },
  SupplySideRevenue: {
    'Assets Yields To Stakers': "Net yield credited to afiUSD holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
