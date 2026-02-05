import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const duneQuery = `
    select
      sum(daily_revenue) as revenue_usd
    from query_5535845
    where day = date(from_unixtime(${options.startOfDay}))`

  const cashRevenues = await queryDuneSql(options,duneQuery)

  // Borrow interest from cash lending - protocol revenue
  if (cashRevenues[0].revenue_usd > 0) {
    dailyFees.addUSDValue(cashRevenues[0].revenue_usd, METRIC.BORROW_INTEREST);
    dailyRevenue.addUSDValue(cashRevenues[0].revenue_usd, METRIC.BORROW_INTEREST);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SCROLL],
  dependencies: [Dependencies.DUNE],
  start: '2024-11-01',
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total borrow interest generated from EtherFi Cash services on Scroll.",
    Revenue: "Protocol's share of fees from borrow interest.",
    ProtocolRevenue: "Same as Revenue - all protocol earnings from EtherFi Cash on Scroll.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: 'Interest earned from EtherFi Cash lending operations on Scroll',
    },
    Revenue: {
      [METRIC.BORROW_INTEREST]: 'Interest earned from EtherFi Cash lending operations on Scroll',
    },
  }
};

export default adapter;