/**
 * Berachain Bribes Revenue Methodology
 * 
 * This adapter tracks incentive tokens distributed through Berachain's Proof-of-Liquidity (PoL) system
 * as "bribes" paid to validators and delegators. In Berachain's PoL mechanism, protocols can add 
 * incentive tokens to whitelisted reward vaults to encourage BGT (Berachain Governance Token) delegation
 * to specific validators. These incentives are distributed proportionally based on BGT emissions.
 * 
 * We count as bribes:
 * 1. BGTBoosterIncentivesProcessed events - incentives distributed through the BGT booster mechanism
 * 2. IncentivesProcessed events - direct incentive distributions from reward vaults
 * 
 * The methodology captures the total value of incentive tokens flowing through the ecosystem,
 * representing the "bribes" that protocols pay to attract validator delegation and liquidity.
 * This creates a market-driven mechanism where protocols compete for block space and validator attention
 * through incentive offerings.
 * 
 * Source: https://docs.berachain.com/learn/guides/add-incentives-for-reward-vault
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch: any = async (_a: any, _b: any, options: FetchOptions) => {
    // source: https://dune.com/queries/5041579/8329113
    const query = `
    with incentives_token as (
        select distinct
            t.token,
            a.decimals
        from
            berachain_berachain.rewardvault_evt_incentiveadded t
            left join tokens.erc20 a on a.contract_address = t.token
            and a.blockchain = 'berachain'
    ),
    bgt_booster_incentives as (
        SELECT
            *
        FROM
            TABLE (
                decode_evm_event (
                    abi => '{
                    "anonymous": false,
                    "inputs": [
                        {
                            "indexed": true,
                            "internalType": "bytes",
                            "name": "pubkey",
                            "type": "bytes"
                        },
                        {
                            "indexed": true,
                            "internalType": "address",
                            "name": "token",
                            "type": "address"
                        },
                        {
                            "indexed": false,
                            "internalType": "uint256",
                            "name": "bgtEmitted",
                            "type": "uint256"
                        },
                        {
                            "indexed": false,
                            "internalType": "uint256",
                            "name": "amount",
                            "type": "uint256"
                        }
                    ],
                    "name": "BGTBoosterIncentivesProcessed",
                    "type": "event"
                }',
                input => TABLE (
                    SELECT
                        *
                    FROM
                        berachain.logs
                    WHERE
                        contract_address in (
                            select vault from berachain_berachain.reward_vault_factory_evt_vaultcreated
                        )
                        AND topic0 = 0x447452569a869245fac1955d7c6c762fbd3b4ad4c1695b1b0f1cc5985958a271
                        AND block_time >= from_unixtime(${options.startTimestamp})
                        AND block_time <= from_unixtime(${options.endTimestamp})
                    )
                )
            )
    ),
    distribution as (
        select
            t.token,
            sum(t.amount) as token_amount
        from
            bgt_booster_incentives t
            left join incentives_token a on a.token = t.token
        where
            t.block_time >= from_unixtime(${options.startTimestamp})
            AND t.block_time <= from_unixtime(${options.endTimestamp})
        group by
            t.token
    ),
    distribution_validators as (
        select
            t.token,
            sum(t.amount) as token_amount
        from
             berachain_berachain.rewardvault_evt_incentivesprocessed t
            left join incentives_token a on a.token = t.token
        where
            t.evt_block_time >= from_unixtime(${options.startTimestamp})
            AND t.evt_block_time <= from_unixtime(${options.endTimestamp})
        group by
            t.token
    ),
    incentive_taxes as (
        SELECT
            *
        FROM
            TABLE (
                decode_evm_event (
                    abi => '{
                    "type": "event",
                    "name": "IncentiveFeeCollected",
                    "inputs": [
                        {
                            "name": "token",
                            "type": "address",
                            "indexed": true,
                            "internalType": "address"
                        },
                        {
                            "name": "amount",
                            "type": "uint256",
                            "indexed": false,
                            "internalType": "uint256"
                        }
                    ],
                    "anonymous": false
                }',
                input => TABLE (
                    SELECT
                        *
                    FROM
                        berachain.logs
                    WHERE
                        contract_address in (
                            select vault from berachain_berachain.reward_vault_factory_evt_vaultcreated
                        )
                        AND topic0 = 0x38cdaea8a7ee499a6e329f9f098f5b7943ea1e992b5fb4ad0a88884db15c3f89
                        AND block_time >= from_unixtime(${options.startTimestamp})
                        AND block_time <= from_unixtime(${options.endTimestamp})
                )
            )
        )
    ),
    taxes as (
        select
            it.token,
            sum(it.amount) as token_amount
        from
            incentive_taxes it
            left join incentives_token a on a.token = it.token
        where
            it.block_time >= from_unixtime(${options.startTimestamp})
            AND it.block_time <= from_unixtime(${options.endTimestamp})
        group by
            it.token
    )
    select 
        token,
        sum(token_amount) as token_amount
    from(
        select * from distribution
        union all
        select * from distribution_validators
        union all
        select * from taxes
    ) a
    group by token
    `;
    const fees = await queryDuneSql(options, query);

    const dailyBribesRevenue = options.createBalances();

    fees.forEach((row: any) => {
        if (row.token_amount > 0) {
            dailyBribesRevenue.addToken(row.token, row.token_amount);
        }
    });

    return {
        dailyFees: "0",
        dailyBribesRevenue
    };
};

const methodology = {
    BribeRevenue: "Incentives Distributed From Berachain Reward Vaults",
};

const adapter: SimpleAdapter = {
    version: 1,
    dependencies: [Dependencies.DUNE],
    fetch,
    chains: [CHAIN.BERACHAIN],
    start: "2025-02-05",
    methodology,
    isExpensiveAdapter: true,
};

export default adapter;
