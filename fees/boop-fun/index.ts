import ADDRESSES from '../../helpers/coreAssets.json'
// Fee Source : https://docs.boop.fun/token-deployment-101

import { Dependencies, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

interface IData {
    total_graduation_events: number;
    total_staker_sol_collected: number;
    total_buyback_sol_collected: number;
    total_protocol_sol_collected: number;
    total_buyback_boop_collected: number;
}

const STAKER_FEE_ADDRESS = 'DLw61XD3AE2cmUaoawHP8KM1ZxCW3vbboyUDkn8pfjQt';
const BUYBACK_FEE_ADDRESS = '43YvSqTTRhHV2EL9BSSRCPwcrNNYF3dtra46Gbni73jf';
const PROTOCOL_FEE_ADDRESS = '8QwU16Xe4BPyUD9MktHtgVjQQ5fAwywb9Zd5Hg1YTauF';
const BOOP_ADDRESS = 'boopkpWqe68MSxLqBGogs8ZbUDN4GXaLhFwNP7mpP1i';
const BOOP_CG_ID = 'boop-4';
const NATIVE_SOL_MINT_ADDRESS = ADDRESSES.solana.SOL;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = `
        WITH graduation_events AS (
            SELECT
                count(*) AS total_graduation_events
            FROM
                solana.instruction_calls
            WHERE
                tx_success = TRUE
                AND inner_executing_account = 'boop8hVGQGqehUK2iVEMEnMrL5RbjywRzHKBmBE7ry4'
                AND (
                    VARBINARY_STARTS_WITH (data, 0x2debe1b511da4082)
                )
                AND TIME_RANGE
        ),
        staker_sol_collected AS (
            SELECT
                COALESCE(SUM(amount) / 1e9, 0) AS total_sol
            FROM
                tokens_solana.transfers
            WHERE
                to_owner = '${STAKER_FEE_ADDRESS}'
                AND token_mint_address = '${NATIVE_SOL_MINT_ADDRESS}'
                AND TIME_RANGE
        ),
        buyback_sol_collected AS (
            SELECT
                COALESCE(SUM(amount) / 1e9, 0) AS total_sol
            FROM
                tokens_solana.transfers
            WHERE
                to_owner = '${BUYBACK_FEE_ADDRESS}'
                AND token_mint_address = '${NATIVE_SOL_MINT_ADDRESS}'
                AND TIME_RANGE
        ),
        protocol_sol_collected AS (
            SELECT
                COALESCE(SUM(amount) / 1e9, 0) AS total_sol
            FROM
                tokens_solana.transfers
            WHERE
                to_owner = '${PROTOCOL_FEE_ADDRESS}'
                AND token_mint_address = '${NATIVE_SOL_MINT_ADDRESS}'
                AND TIME_RANGE
        ),
        buyback_boop_collected AS (
            SELECT
                COALESCE(SUM(amount) / 1e9, 0) AS total_boop
            FROM
                tokens_solana.transfers
            WHERE
                to_owner = '${BUYBACK_FEE_ADDRESS}'
                AND token_mint_address = '${BOOP_ADDRESS}'
                AND TIME_RANGE
        )
        SELECT
            (SELECT total_graduation_events FROM graduation_events) AS total_graduation_events,
            (SELECT total_sol FROM staker_sol_collected) AS total_staker_sol_collected,
            (SELECT total_sol FROM buyback_sol_collected) AS total_buyback_sol_collected,
            (SELECT total_sol FROM protocol_sol_collected) AS total_protocol_sol_collected,
            (SELECT total_boop FROM buyback_boop_collected) AS total_buyback_boop_collected
    `;
    const data: IData[] = await queryDuneSql(options, query);

    const {
        total_graduation_events,
        total_staker_sol_collected,
        total_buyback_sol_collected,
        total_protocol_sol_collected,
        total_buyback_boop_collected
    } = data[0];

    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    dailyProtocolRevenue.addCGToken('solana', total_protocol_sol_collected);
    dailyHoldersRevenue.addCGToken('solana', total_staker_sol_collected);
    dailyHoldersRevenue.addCGToken('solana', total_buyback_sol_collected);
    dailyHoldersRevenue.addCGToken(BOOP_CG_ID, total_buyback_boop_collected);

    // Staking Rewards (e.g., 5% graduation token supply to holders).
    // This is not a direct fee collection but a distribution/minting event requiring specific logic. graduation marketcap is fixed 400 SOL, so 5% of that is 20 SOL.
    dailyHoldersRevenue.addCGToken('solana', 20 * total_graduation_events);

    // EMISSION are not inclded in the fees/revenue
    // Graduation Rewards (e.g., daily 1M BOOP for graduated cults - 90% to holders, 10% to creator).

    dailyFees.addBalances(dailyProtocolRevenue);
    dailyFees.addBalances(dailyHoldersRevenue);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-05-01',
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology: {
        Fees: 'Total fees paid by users, comprising all SOL and BOOP tokens collected by the protocol, staker, and buyback wallets.',
        Revenue: 'Total fees paid by users.',
        ProtocolRevenue: 'Includes boopfun frontend fees(0.1%), graduation fees(0.1%), and Raydium Initial liquidity fees(0.1%)',
        HoldersRevenue: 'Includes frontend fees(0.9%), instant unstaking fees 5% (BOOP to buyback), Raydium trading fees(0.1%), and Staking rewards 5% supply at graduation(approx 20 SOL).',
    }
}

export default adapter
