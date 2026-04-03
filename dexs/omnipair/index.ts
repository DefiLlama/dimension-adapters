import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

async function fetch(_a: any, _b: any, options: FetchOptions) {
    const query = `
    select
      token_mint,
      cast(daily_volume as varchar) as daily_volume,
      cast(daily_fees as varchar) as daily_fees,
      cast(daily_user_fees as varchar) as daily_user_fees,
      cast(daily_revenue as varchar) as daily_revenue,
      cast(daily_protocol_revenue as varchar) as daily_protocol_revenue,
      cast(daily_supply_side_revenue as varchar) as daily_supply_side_revenue,
      cast(swap_fees_total as varchar) as swap_fees_total,
      cast(swap_fees_protocol as varchar) as swap_fees_protocol,
      cast(swap_fees_lp as varchar) as swap_fees_lp,
      cast(borrow_interest_total as varchar) as borrow_interest_total,
      cast(borrow_interest_protocol as varchar) as borrow_interest_protocol,
      cast(borrow_interest_lp as varchar) as borrow_interest_lp
    from query_6940593
    where block_date = cast(from_unixtime(${options.startOfDay}) as date)
    `
    const data = await queryDuneSql(options, query)

    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    const dailyUserFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()

    data.forEach(row => {
        dailyVolume.add(row.token_mint, row.daily_volume)

        if (row.swap_fees_total !== '0') {
            dailyFees.add(row.token_mint, row.swap_fees_total, METRIC.SWAP_FEES)
            dailyUserFees.add(row.token_mint, row.swap_fees_total, METRIC.SWAP_FEES)
        }

        if (row.swap_fees_protocol !== '0') {
            dailyRevenue.add(row.token_mint, row.swap_fees_protocol, METRIC.SWAP_FEES)
            dailyProtocolRevenue.add(row.token_mint, row.swap_fees_protocol, METRIC.SWAP_FEES)
        }

        if (row.swap_fees_lp !== '0') {
            dailySupplySideRevenue.add(row.token_mint, row.swap_fees_lp, METRIC.SWAP_FEES)
        }

        if (row.borrow_interest_total !== '0') {
            dailyFees.add(row.token_mint, row.borrow_interest_total, METRIC.BORROW_INTEREST)
            dailyUserFees.add(row.token_mint, row.borrow_interest_total, METRIC.BORROW_INTEREST)
        }

        if (row.borrow_interest_protocol !== '0') {
            dailyRevenue.add(row.token_mint, row.borrow_interest_protocol, METRIC.BORROW_INTEREST)
            dailyProtocolRevenue.add(row.token_mint, row.borrow_interest_protocol, METRIC.BORROW_INTEREST)
        }

        if (row.borrow_interest_lp !== '0') {
            dailySupplySideRevenue.add(row.token_mint, row.borrow_interest_lp, METRIC.BORROW_INTEREST)
        }
    })

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "All swap fees and borrow interest paid by users on Omnipair. Swap fees are computed as lp_fee + protocol_fee. Borrow interest is computed from UpdatePairEvent accrued_interest fields.",
    UserFees: "All swap fees and borrow interest paid directly by users on Omnipair.",
    Revenue: "Protocol revenue equals the protocol share of swap fees plus the protocol share of borrow interest.",
    ProtocolRevenue: "Protocol revenue equals the protocol share of swap fees plus the protocol share of borrow interest.",
    SupplySideRevenue: "Supply-side revenue equals the LP share of swap fees plus the LP share of borrow interest.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "All swap fees paid by users on Omnipair.",
        [METRIC.BORROW_INTEREST]: "All interest paid by borrowers on Omnipair.",
    },
    UserFees: {
        [METRIC.SWAP_FEES]: "All swap fees paid by users on Omnipair.",
        [METRIC.BORROW_INTEREST]: "All interest paid by borrowers on Omnipair.",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "The protocol_fee portion of swap fees.",
        [METRIC.BORROW_INTEREST]: "The protocol share of borrow interest.",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "The protocol_fee portion of swap fees.",
        [METRIC.BORROW_INTEREST]: "The protocol share of borrow interest.",
    },
    SupplySideRevenue: {
        [METRIC.SWAP_FEES]: "The lp_fee portion of swap fees distributed to liquidity providers.",
        [METRIC.BORROW_INTEREST]: "The LP share of borrow interest distributed to liquidity providers.",
    },
}

const adapter: SimpleAdapter = {
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
