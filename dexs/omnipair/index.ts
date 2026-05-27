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
      cast(borrow_interest_lp as varchar) as borrow_interest_lp,
      cast(liquidation_fees_total as varchar) as liquidation_fees_total,
      cast(liquidation_fees_protocol as varchar) as liquidation_fees_protocol,
      cast(liquidation_fees_lp as varchar) as liquidation_fees_lp,
      cast(liquidation_fees_liquidators as varchar) as liquidation_fees_liquidators,
      cast(flashloan_fees_total as varchar) as flashloan_fees_total,
      cast(flashloan_fees_protocol as varchar) as flashloan_fees_protocol,
      cast(flashloan_fees_lp as varchar) as flashloan_fees_lp
    from query_7331448
    where block_date = cast(from_unixtime(${options.startOfDay}) as date)
    `;
    const data = await queryDuneSql(options, query);

    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyUserFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    data.forEach((row: any) => {
        dailyVolume.add(row.token_mint, row.daily_volume);

        dailyFees.add(row.token_mint, row.swap_fees_total, METRIC.SWAP_FEES);
        dailyUserFees.add(row.token_mint, row.swap_fees_total, METRIC.SWAP_FEES);
        dailyRevenue.add(row.token_mint, row.swap_fees_protocol, METRIC.SWAP_FEES);
        dailyProtocolRevenue.add(row.token_mint, row.swap_fees_protocol, METRIC.SWAP_FEES);
        dailySupplySideRevenue.add(row.token_mint, row.swap_fees_lp, METRIC.SWAP_FEES);

        dailyFees.add(row.token_mint, row.borrow_interest_total, METRIC.BORROW_INTEREST);
        dailyUserFees.add(row.token_mint, row.borrow_interest_total, METRIC.BORROW_INTEREST);
        dailyRevenue.add(row.token_mint, row.borrow_interest_protocol, METRIC.BORROW_INTEREST);
        dailyProtocolRevenue.add(row.token_mint, row.borrow_interest_protocol, METRIC.BORROW_INTEREST);
        dailySupplySideRevenue.add(row.token_mint, row.borrow_interest_lp, METRIC.BORROW_INTEREST);

        dailyFees.add(row.token_mint, row.liquidation_fees_total, METRIC.LIQUIDATION_FEES);
        dailyUserFees.add(row.token_mint, row.liquidation_fees_total, METRIC.LIQUIDATION_FEES);
        dailyRevenue.add(row.token_mint, row.liquidation_fees_protocol, METRIC.LIQUIDATION_FEES);
        dailyProtocolRevenue.add(row.token_mint, row.liquidation_fees_protocol, METRIC.LIQUIDATION_FEES);
        dailySupplySideRevenue.add(row.token_mint, row.liquidation_fees_lp, METRIC.LIQUIDATION_FEES);
        dailySupplySideRevenue.add(row.token_mint, row.liquidation_fees_liquidators, METRIC.LIQUIDATION_FEES);

        dailyFees.add(row.token_mint, row.flashloan_fees_total, METRIC.FLASHLOAN_FEES);
        dailyUserFees.add(row.token_mint, row.flashloan_fees_total, METRIC.FLASHLOAN_FEES);
        dailyRevenue.add(row.token_mint, row.flashloan_fees_protocol, METRIC.FLASHLOAN_FEES);
        dailyProtocolRevenue.add(row.token_mint, row.flashloan_fees_protocol, METRIC.FLASHLOAN_FEES);
        dailySupplySideRevenue.add(row.token_mint, row.flashloan_fees_lp, METRIC.FLASHLOAN_FEES);
    });

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
}

const methodology = {
    Fees: "All swap fees, borrow interest, liquidation fees, and flashloan fees paid through Omnipair. Swap fees are computed as lp_fee + protocol_fee. Borrow interest is computed from UpdatePairEvent accrued_interest fields.",
    UserFees: "All swap fees, borrow interest, liquidation fees, and flashloan fees paid directly by users on Omnipair.",
    Revenue: "Protocol revenue equals the protocol share of swap fees, the protocol share of borrow interest, the protocol share of liquidation fees if any, and any protocol share of flashloan fees.",
    ProtocolRevenue: "Protocol revenue equals the protocol share of swap fees, the protocol share of borrow interest, the protocol share of liquidation fees if any, and any protocol share of flashloan fees.",
    SupplySideRevenue: "Supply-side revenue equals the LP share of swap fees, the LP share of borrow interest, any LP share of flashloan fees, and the liquidator share of liquidation fees.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.SWAP_FEES]: "All swap fees paid by users on Omnipair.",
        [METRIC.BORROW_INTEREST]: "All interest paid by borrowers on Omnipair.",
        [METRIC.LIQUIDATION_FEES]: "All liquidation fees paid by users on Omnipair.",
        [METRIC.FLASHLOAN_FEES]: "All flashloan fees paid by users on Omnipair.",
    },
    UserFees: {
        [METRIC.SWAP_FEES]: "All swap fees paid by users on Omnipair.",
        [METRIC.BORROW_INTEREST]: "All interest paid by borrowers on Omnipair.",
        [METRIC.LIQUIDATION_FEES]: "All liquidation fees paid by users on Omnipair.",
        [METRIC.FLASHLOAN_FEES]: "All flashloan fees paid by users on Omnipair.",
    },
    Revenue: {
        [METRIC.SWAP_FEES]: "The protocol_fee portion of swap fees.",
        [METRIC.BORROW_INTEREST]: "The protocol share of borrow interest.",
        [METRIC.LIQUIDATION_FEES]: "The protocol share of liquidation fees, if any.",
        [METRIC.FLASHLOAN_FEES]: "The protocol share of flashloan fees, if any.",
    },
    ProtocolRevenue: {
        [METRIC.SWAP_FEES]: "The protocol_fee portion of swap fees.",
        [METRIC.BORROW_INTEREST]: "The protocol share of borrow interest.",
        [METRIC.LIQUIDATION_FEES]: "The protocol share of liquidation fees, if any.",
        [METRIC.FLASHLOAN_FEES]: "The protocol share of flashloan fees, if any.",
    },
    SupplySideRevenue: {
        [METRIC.SWAP_FEES]: "The lp_fee portion of swap fees distributed to liquidity providers.",
        [METRIC.BORROW_INTEREST]: "The LP share of borrow interest distributed to liquidity providers.",
        [METRIC.LIQUIDATION_FEES]: "The liquidator share and any LP share of liquidation fees.",
        [METRIC.FLASHLOAN_FEES]: "The LP share of flashloan fees, if any.",
    },
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: '2026-02-21',
    isExpensiveAdapter: true,
    methodology,
    breakdownMethodology,
};

export default adapter;
