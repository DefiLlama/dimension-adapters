import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import coreAssets from "../../helpers/coreAssets.json"

const NETWORK_CONTRIBUTORS = "DoubleZero Network Contributors";
const SHRED_ORIGINATING_VALIDATORS = "Shred-Originating Validators";
const PROTOCOL_CLIENT_TEAMS = "Protocol Client Teams";
const PROTOCOL_SECURITY_BURN = "Protocol Security Burn";
const EDGE_SHRED_SUBSCRIPTIONS = "Edge Shred Subscriptions";

const fetch: any = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const query = `
    WITH settlement_ix AS (
        SELECT DISTINCT
            tx_id
        FROM solana.instruction_calls
        WHERE executing_account = 'dzshrr3yL57SB13sJPYHYo3TV8Bo1i1FxkyrZr3bKNE'
            AND tx_success
            AND array_join(log_messages, ' ') LIKE '%Transferred % USDC to shred distribution%'
            AND TIME_RANGE
    ),
    settled_transfers AS (
        SELECT
            t.block_date,
            t.amount AS usdc_amount
        FROM tokens_solana.transfers t
        JOIN settlement_ix i
            ON t.tx_id = i.tx_id
            AND TIME_RANGE
        WHERE t.token_mint_address = '${coreAssets.solana.USDC}'
            AND t.outer_executing_account = 'dzshrr3yL57SB13sJPYHYo3TV8Bo1i1FxkyrZr3bKNE'
            AND TIME_RANGE
    )
    SELECT SUM(usdc_amount) AS fees
    FROM settled_transfers`;
    const fees = await queryDuneSql(options, query);
    dailyFees.add(coreAssets.solana.USDC, fees?.[0]?.fees ?? 0, EDGE_SHRED_SUBSCRIPTIONS);
    const dailySupplySideRevenue = options.createBalances();
    dailySupplySideRevenue.addBalances(dailyFees.clone(0.45), NETWORK_CONTRIBUTORS);
    dailySupplySideRevenue.addBalances(dailyFees.clone(0.2925), SHRED_ORIGINATING_VALIDATORS);
    dailySupplySideRevenue.addBalances(dailyFees.clone(0.1575), PROTOCOL_CLIENT_TEAMS);
    const dailyHoldersRevenue = dailyFees.clone(0.1, PROTOCOL_SECURITY_BURN)

    return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue
    }
}

const breakdownMethodology = {
    Fees: {
        [EDGE_SHRED_SUBSCRIPTIONS]: "USDC payments for DoubleZero Edge shred subscriptions, measured from settled transfers into the shred distribution flow.",
    },
    Revenue: {
        [PROTOCOL_SECURITY_BURN]: "10% of gross Edge revenue is burned in 2Z for protocol security.",
    },
    SupplySideRevenue: {
        [NETWORK_CONTRIBUTORS]: "45% of gross Edge revenue, equal to 50% of the post-burn remainder, is distributed to DoubleZero network contributors proportional to contribution.",
        [SHRED_ORIGINATING_VALIDATORS]: "29.25% of gross Edge revenue, equal to 32.5% of the post-burn remainder, is distributed to shred-originating validators proportional to leader shreds.",
        [PROTOCOL_CLIENT_TEAMS]: "15.75% of gross Edge revenue, equal to 17.5% of the post-burn remainder, is distributed to protocol client teams proportional to shred distribution.",
    },
    HoldersRevenue: {
        [PROTOCOL_SECURITY_BURN]: "10% of gross Edge revenue is burned in 2Z for protocol security.",
    },
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2026-05-01',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology: {
        Fees: "USDC payments for DoubleZero Edge shred subscriptions, measured from settled transfers into the shred distribution flow.",
        Revenue: "10% of Edge revenue is burned in 2Z for protocol security.",
        ProtocolRevenue: "No protocol revenue",
        HoldersRevenue: "10% of Edge revenue is burned in 2Z for protocol security.",
        SupplySideRevenue: "90% of Edge revenue is distributed: 50% of the remainder to DoubleZero network contributors, 32.5% to shred-originating validators, and 17.5% to protocol client teams."
    },
    breakdownMethodology,
};

export default adapter;
    
