import { Adapter, Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const USER_SAFE_EVENT_EMITTER = "0x5423885B376eBb4e6104b8Ab1A908D350F6A162e";
const CASHBACK_DISPATCHER = "0x7d372C3ca903CA2B6ecd8600D567eb6bAfC5e6c9";
const SETTLEMENT_DISPATCHER = "0x4Dca5093E0bB450D7f7961b5Df0A9d4c24B24786";
const MetricLabels = {
  CASH_TRANSACTION_FEES: 'Cash Transaction Fees',
  BORROW_INTEREST: METRIC.BORROW_INTEREST,
  CASHBACKS: 'Cashbacks'
};

const getCashRevenueStreams = async (options: FetchOptions) => {
  const query = `
    with

    -- ether.fi cash spend events (transaction fees)
    spend_events as (
        select
            bytearray_to_uint256(bytearray_substring(data,33,32))/1e6 as spend_usd
        from
        scroll.logs
        where TIME_RANGE
        and contract_address in (0x5423885B376eBb4e6104b8Ab1A908D350F6A162e, 0x380B2e96799405be6e3D965f4044099891881acB)
        and topic0 = 0xe70f33131caa91c15ec116944772ba79bcc4cd6501cdfa178d66f903a796759a

        union all

        select
            bytearray_to_uint256(bytearray_substring(data,33,32))/1e6 as spend_usd
        from
        scroll.logs
        where TIME_RANGE
        and contract_address = 0x380B2e96799405be6e3D965f4044099891881acB
        and topic0 = 0xbe1dc90fb3facc4238834ef8da43ef4f286440a3546f49a89ebb82efb37f21cb

        union all

        select
            bytearray_to_uint256(bytearray_substring(data, 321, 32)) / 1e6 as spend_usd
        from
        scroll.logs
        where TIME_RANGE
        and contract_address = 0x380B2e96799405be6e3D965f4044099891881acB
        and topic0 = 0x244f4cc0665ad7ee4709aa59b30d3ea581cecde1b0430a3f23a5dc609d4890fc
    ),

    -- ether.fi cash spends revenue (1.38% fee)
    cash_spends_revenue as (
        select
            'cash_spends' as revenue_source,
            sum(0.0138 * spend_usd) as revenue_usd
        from
        spend_events
    ),

    -- ether.fi cash borrows revenue (direct calculation from queries)
    cash_borrows_revenue as (
        select
            'cash_borrows' as revenue_source,
            sum(daily_revenue) as revenue_usd
        from
        query_5535845
        where day = date(from_unixtime(${options.startOfDay}))
    ),

    -- ether.fi cash cashback events
    cashback_events as (
        select
            bytearray_to_uint256(bytearray_substring(data,65,32))/1e6 as cashback_usd
        from
        scroll.logs
        where TIME_RANGE
        and contract_address = 0x5423885B376eBb4e6104b8Ab1A908D350F6A162e
        and topic0 = 0xc2f328aca2253ffbf4bdb01552106555dbedd5b21bc86578abbbb849d73613a6

        union all

        select
            bytearray_to_uint256(bytearray_substring(data,97,32))/1e6 + bytearray_to_uint256(bytearray_substring(data,161,32))/1e6 as cashback_usd
        from
        scroll.logs
        where TIME_RANGE
        and contract_address = 0x380B2e96799405be6e3D965f4044099891881acB
        and topic0 = 0xeb47a17fe64c36c7ac73cc029dd561d73e8df11215ed25fbb8c30653bf6d3a72

        union all

        select
            bytearray_to_uint256(bytearray_substring(data,97,32))/1e6 as cashback_usd
        from
        scroll.logs
        where TIME_RANGE
        and contract_address = 0x380B2e96799405be6e3D965f4044099891881acB
        and topic0 = 0x0b79a9660f2e7ba216d6c8c6aa4a73dff96833d3c0b14a067da90c3b1f3118dc

        union all

        select
            bytearray_to_uint256(bytearray_substring(data,97,32))/1e6 as cashback_usd
        from
        scroll.logs
        where TIME_RANGE
        and contract_address = 0x380B2e96799405be6e3D965f4044099891881acB
        and topic0 = 0x89d3571a498b5d3d68599f5f00c3016f9604aafa7701c52c1b04109cd909a798
    ),

    -- ether.fi cashbacks revenue
    cash_cashbacks_revenue as (
        select
            'cash_cashbacks' as revenue_source,
            sum(cashback_usd) as revenue_usd
        from
        cashback_events
    )

    -- Combine all revenue sources
    select revenue_source, revenue_usd from cash_spends_revenue
    union all
    select revenue_source, revenue_usd from cash_borrows_revenue
    union all
    select revenue_source, revenue_usd from cash_cashbacks_revenue`;

  const result = await queryDuneSql(options, query);
  const revenues = {
    cashSpends: 0,
    cashBorrows: 0,
    cashCashbacks: 0
  };

  if (result && result.length > 0) {
    result.forEach(row => {
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

  // Cash transaction fees (1.38% on card spends) - protocol revenue
  if (cashRevenues.cashSpends > 0) {
    dailyFees.addUSDValue(cashRevenues.cashSpends, MetricLabels.CASH_TRANSACTION_FEES);
    dailyRevenue.addUSDValue(cashRevenues.cashSpends, MetricLabels.CASH_TRANSACTION_FEES);
  }

  // Borrow interest from cash lending - protocol revenue
  if (cashRevenues.cashBorrows > 0) {
    dailyFees.addUSDValue(cashRevenues.cashBorrows, MetricLabels.BORROW_INTEREST);
    dailyRevenue.addUSDValue(cashRevenues.cashBorrows, MetricLabels.BORROW_INTEREST);
  }

  // Cashbacks paid to users - supply side revenue (paid by external providers)
  if (cashRevenues.cashCashbacks > 0) {
    dailyFees.addUSDValue(cashRevenues.cashCashbacks, MetricLabels.CASHBACKS);
    dailySupplySideRevenue.addUSDValue(cashRevenues.cashCashbacks, MetricLabels.CASHBACKS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SCROLL],
  dependencies: [Dependencies.DUNE],
  start: '2024-11-01',
  methodology: {
    Fees: "Total fees generated from EtherFi Cash services on Scroll including transaction fees, borrow interest, and cashbacks.",
    Revenue: "Protocol's share of fees from EtherFi Cash operations including transaction fees and borrow interest.",
    ProtocolRevenue: "Same as Revenue - all protocol earnings from EtherFi Cash on Scroll.",
    SupplySideRevenue: "Cashback rewards paid to users by external providers.",
  },
  breakdownMethodology: {
    Fees: {
      [MetricLabels.CASH_TRANSACTION_FEES]: '1.38% transaction fees from EtherFi Cash card usage on Scroll',
      [MetricLabels.BORROW_INTEREST]: 'Interest earned from EtherFi Cash lending operations on Scroll',
      [MetricLabels.CASHBACKS]: 'Cashback rewards paid to card users by external providers on Scroll',
    },
    Revenue: {
      [MetricLabels.CASH_TRANSACTION_FEES]: '1.38% transaction fees from EtherFi Cash card usage on Scroll',
      [MetricLabels.BORROW_INTEREST]: 'Interest earned from EtherFi Cash lending operations on Scroll',
    },
    SupplySideRevenue: {
      [MetricLabels.CASHBACKS]: 'Cashback rewards paid to card users by external providers on Scroll',
    },
  }
};

export default adapter;
