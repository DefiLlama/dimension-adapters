import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const getCashRevenueStreams = async (options: FetchOptions) => {
  const query = `
        select
            'cash_borrows' as revenue_source,
            sum(daily_revenue) as revenue_usd
        from
        query_5535845
        where day = date(from_unixtime(${options.startOfDay}))
`

  const result = await queryDuneSql(options, query);
  const revenues = {
    cashSpends: 0,
    cashBorrows: 0,
    cashCashbacks: 0
  };

  if (result && result.length > 0) {
    result.forEach((row: any) => {
      switch (row.revenue_source) {
        case 'cash_spends':
          revenues.cashSpends = Number(row.revenue_usd || 0);
          break;
        case 'cash_borrows':
          revenues.cashBorrows = Number(row.revenue_usd || 0);
          break;
        case 'cash_cashbacks':
          revenues.cashCashbacks = Number(row.revenue_usd || 0);
          break;
      }
    });
  }
  return revenues;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const cashRevenues = await getCashRevenueStreams(options);

  // Borrow interest from cash lending - protocol revenue
  if (cashRevenues.cashBorrows > 0) {
    dailyFees.addUSDValue(cashRevenues.cashBorrows, METRIC.BORROW_INTEREST);
    dailyRevenue.addUSDValue(cashRevenues.cashBorrows, METRIC.BORROW_INTEREST);
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