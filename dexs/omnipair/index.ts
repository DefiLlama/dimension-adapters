import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const query = `
    select
      cast(block_date as varchar) as block_date,
      token_in_mint,
      cast(daily_volume as varchar) as daily_volume,
      cast(daily_fees as varchar) as daily_fees,
      cast(daily_revenue as varchar) as daily_revenue,
      cast(daily_protocol_revenue as varchar) as daily_protocol_revenue,
      cast(daily_supply_side_revenue as varchar) as daily_supply_side_revenue
    from query_6897800
    where block_date = cast(from_unixtime(${options.startOfDay}) as date)
    order by 1 desc, 2
    `
    const data = await queryDuneSql(options, query)

    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()

    data.forEach(row => {
        dailyVolume.add(row.token_in_mint, Number(row.daily_volume))
        dailyFees.add(row.token_in_mint, Number(row.daily_fees), METRIC.SWAP_FEES)
        dailyRevenue.add(row.token_in_mint, Number(row.daily_revenue), METRIC.SWAP_FEES)
        dailySupplySideRevenue.add(row.token_in_mint, Number(row.daily_supply_side_revenue), METRIC.SWAP_FEES)
    })

    return { 
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "All swap fees paid by users on Omnipair. Computed from Dune as lp_fee + protocol_fee, grouped by input token mint.",
    Revenue: "Protocol revenue equals the protocol_fee portion of swap fees.",
    ProtocolRevenue: "Protocol revenue equals the protocol_fee portion of swap fees.",
    SupplySideRevenue: "Supply-side revenue equals the lp_fee portion distributed to liquidity providers.",
  };

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "All swap fees paid by users on Omnipair",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "The protocol_fee portion of swap fees.",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "The protocol_fee portion of swap fees.",
    },
    SupplySideRevenue: {
        [METRIC.LP_FEES]: "The lp_fee portion of swap fees distributed to liquidity providers.",
    },
}

const adapter : SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: '2026-02-21',
    isExpensiveAdapter: true,
    methodology,
    breakdownMethodology,
}

export default adapter