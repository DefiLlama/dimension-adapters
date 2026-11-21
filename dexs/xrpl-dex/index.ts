import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// RLUSD, Ripple's stablecoin (https://ripple.com/solutions/stablecoin/), prices the AMM pools that have no XRP side
const RLUSD_CURRENCY = "524C555344000000000000000000000000000000";
const RLUSD_ISSUER = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
const SWAP_FEES_TO_LPS = "Swap Fees To LPs";

const fetch = async (options: FetchOptions) => {
    const formattedDate = options.dateString

    const query = `
    WITH volume AS (
        SELECT dex_xrp_pair_volume_xrp, amm_xrp_volume_xrp FROM xrpl.aggregated_metrics_daily WHERE date = DATE '${formattedDate}'
    ), swaps AS (
        SELECT
            ABS(ABS(amm_base_token_balance_delta) - counter_token_amount) < ABS(ABS(amm_base_token_balance_delta) - base_token_amount) AS flip,
            base_token, COALESCE(base_token_issuer, '') AS base_issuer, counter_token, COALESCE(counter_token_issuer, '') AS counter_issuer,
            amm_base_token_balance_before AS bal1, amm_base_token_balance_delta AS delta1,
            amm_counter_token_balance_before AS bal2, amm_counter_token_balance_delta AS delta2
        FROM xrpl.dex_swaps
        WHERE date = DATE '${formattedDate}' AND fulfilled_by = 'AMM'
    ), sides AS (
        SELECT
            IF(flip, counter_token, base_token) AS cur1, IF(flip, counter_issuer, base_issuer) AS iss1,
            IF(flip, base_token, counter_token) AS cur2, IF(flip, base_issuer, counter_issuer) AS iss2,
            bal1, delta1, bal2, delta2
        FROM swaps
        WHERE (delta1 > 0 AND delta2 < 0) OR (delta1 < 0 AND delta2 > 0)
    ), legs AS (
        SELECT
            IF(delta1 > 0, cur1, cur2) AS in_cur, IF(delta1 > 0, iss1, iss2) AS in_iss,
            IF(delta1 > 0, cur2, cur1) AS out_cur, IF(delta1 > 0, iss2, iss1) AS out_iss,
            IF(delta1 > 0, bal1, bal2) AS a, IF(delta1 > 0, delta1, delta2) AS x_in,
            IF(delta1 > 0, bal2, bal1) AS b, -IF(delta1 > 0, delta2, delta1) AS x_out
        FROM sides
    ), fees AS (
        SELECT *, LEAST(GREATEST(x_in - a * x_out / (b - x_out), 0), 0.01 * x_in) AS fee_in
        FROM legs
        WHERE b > x_out
    )
    SELECT
        volume.dex_xrp_pair_volume_xrp,
        volume.amm_xrp_volume_xrp,
        f.swaps,
        f.fees_xrp,
        f.fees_rlusd
    FROM volume
    CROSS JOIN (
        SELECT
            COUNT(*) AS swaps,
            SUM(CASE
                WHEN in_cur = 'XRP' AND in_iss = '' THEN fee_in
                WHEN out_cur = 'XRP' AND out_iss = '' THEN fee_in * x_out / x_in
            END) AS fees_xrp,
            SUM(CASE
                WHEN (in_cur = 'XRP' AND in_iss = '') OR (out_cur = 'XRP' AND out_iss = '') THEN NULL
                WHEN in_cur = '${RLUSD_CURRENCY}' AND in_iss = '${RLUSD_ISSUER}' THEN fee_in
                WHEN out_cur = '${RLUSD_CURRENCY}' AND out_iss = '${RLUSD_ISSUER}' THEN fee_in * x_out / x_in
            END) AS fees_rlusd
        FROM fees
    ) f`;
    const queryResults = await queryDuneSql(options, query);

    if (!queryResults.length) {
        throw new Error(`no row in xrpl.aggregated_metrics_daily for ${formattedDate} yet`);
    }
    const row = queryResults[0];
    if (!(Number(row.swaps) > 0)) {
        throw new Error(`no AMM swaps in xrpl.dex_swaps for ${formattedDate}`);
    }

    const dexVolumeXrp = row.dex_xrp_pair_volume_xrp;
    const ammVolumeXrp = row.amm_xrp_volume_xrp;

    const dailyVolume = options.createBalances();
    dailyVolume.addCGToken("ripple", Number(ammVolumeXrp) + Number(dexVolumeXrp));

    const dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    dailyFees.addCGToken("ripple", Number(row.fees_xrp ?? 0), METRIC.SWAP_FEES);
    dailyFees.addCGToken("ripple-usd", Number(row.fees_rlusd ?? 0), METRIC.SWAP_FEES);
    dailySupplySideRevenue.addCGToken("ripple", Number(row.fees_xrp ?? 0), SWAP_FEES_TO_LPS);
    dailySupplySideRevenue.addCGToken("ripple-usd", Number(row.fees_rlusd ?? 0), SWAP_FEES_TO_LPS);

    return { dailyVolume, dailyFees, dailyRevenue: 0, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
    version: 1, // Dune query, runs once a day
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.RIPPLE],
    start: '2024-03-23', // first full day of the XRPL AMM (XLS-30 went live 2024-03-22)
    isExpensiveAdapter: true,
    methodology: {
        Volume: "XRP-paired trading volume on the XRP Ledger's native DEX: AMM pool swaps plus order book trades, from Dune's xrpl.aggregated_metrics_daily.",
        Fees: "Trading fees paid on XRP Ledger AMM swaps, worked out per swap from the pool's balances before and after the trade. Covers pools with an XRP or RLUSD side; order book trades pay no trading fee. Excludes the smaller fees on single-sided deposits and withdrawals and auction-slot bids.",
        Revenue: "The XRP Ledger takes no cut of AMM trading fees.",
        SupplySideRevenue: "All AMM trading fees stay in the pools and go to their liquidity providers.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.SWAP_FEES]: "Trading fees paid on AMM swaps in pools with an XRP or RLUSD side, valued at each swap's own price.",
        },
        SupplySideRevenue: {
            [SWAP_FEES_TO_LPS]: "AMM trading fees kept by the pools for their liquidity providers.",
        },
    },
};

export default adapter;
