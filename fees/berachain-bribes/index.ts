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

const fetch: any = async (options: FetchOptions) => {
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
                        AND block_time < from_unixtime(${options.endTimestamp})
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
            AND t.block_time < from_unixtime(${options.endTimestamp})
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
            AND t.evt_block_time < from_unixtime(${options.endTimestamp})
        group by
            t.token
    ),
    -- PoL Next (block 23207664, 2026-07-07): vaults send everything after the validator commission to the IncentivesCollector
    -- (IncentivesCollected), which auctions it for WBERA paid to sWBERA and LST stakers. https://docs.berachain.com/general/proof-of-liquidity/changelog
    -- Sample tx 0x37dfa08fe05b427781263460d1060f8d537379a23434429b740f360b95256909
    incentives_collected as (
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
                            "name": "rewardsEmitted",
                            "type": "uint256"
                        },
                        {
                            "indexed": false,
                            "internalType": "uint256",
                            "name": "amount",
                            "type": "uint256"
                        }
                    ],
                    "name": "IncentivesCollected",
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
                        AND topic0 = 0xc867f28f50cad1991611d2718cce29e0bdf1c21ba8ca950d5705db1afc00302b
                        AND block_time >= from_unixtime(${options.startTimestamp})
                        AND block_time < from_unixtime(${options.endTimestamp})
                    )
                )
            )
    ),
    distribution_stakers as (
        select
            t.token,
            sum(t.amount) as token_amount
        from
            incentives_collected t
        group by
            t.token
    ),
    -- The collector (BGTIncentiveFeeCollector 0x1984...) splits each WBERA payout between the sWBERA vault (0x118d...) and the
    -- registered LST staker vaults by stake (_splitAmount); RewardConverted logs each LST vault's WBERA. LST stakers are suppliers.
    collector_split as (
        select
            sum(case when contract_address = 0x6969696969696969696969696969696969696969 then bytearray_to_uint256(data) end) as swbera_wbera,
            sum(case when contract_address = 0x1984baf659607cc5f206c55bb3b00eb3e180190b then bytearray_to_uint256(bytearray_substring(data, 1, 32)) end) as lst_wbera
        from
            berachain.logs
        where
            block_time >= from_unixtime(${options.startTimestamp})
            AND block_time < from_unixtime(${options.endTimestamp})
            AND (
                (contract_address = 0x6969696969696969696969696969696969696969 -- WBERA Transfer, collector -> sWBERA vault
                    AND topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
                    AND topic1 = 0x0000000000000000000000001984baf659607cc5f206c55bb3b00eb3e180190b
                    AND topic2 = 0x000000000000000000000000118d2ceee9785eaf70c15cd74cd84c9f8c3eec9a)
                OR (contract_address = 0x1984baf659607cc5f206c55bb3b00eb3e180190b -- RewardConverted(vault, wberaAmount, lstAmount)
                    AND topic0 = 0x110ea658b6c32d24c841364199b6429365b6ac3479bd2d318a173c514f58c53a)
            )
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
                        AND block_time < from_unixtime(${options.endTimestamp})
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
            AND it.block_time < from_unixtime(${options.endTimestamp})
        group by
            it.token
    )
    select
        token,
        sum(case when source = 'distribution' then token_amount else 0 end) as bribes_to_holders,
        sum(case when source = 'validators' then token_amount else 0 end) as bribes_to_validators,
        sum(case when source = 'taxes' then token_amount else 0 end) as bribes_to_protocol,
        sum(case when source = 'stakers' then token_amount else 0 end) as bribes_to_stakers,
        (
            select cast(coalesce(lst_wbera, 0) as double) / cast(coalesce(lst_wbera, 0) + coalesce(swbera_wbera, 0) as double)
            from collector_split
            where coalesce(lst_wbera, 0) + coalesce(swbera_wbera, 0) > 0
        ) as lst_share
    from (
        select token, token_amount, 'distribution' as source from distribution
        union all
        select token, token_amount, 'validators' as source from distribution_validators
        union all
        select token, token_amount, 'taxes' as source from taxes
        union all
        select token, token_amount, 'stakers' as source from distribution_stakers
    ) a
    group by token
    `;
  const fees = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  fees.forEach((row: any) => {
    if (row.bribes_to_holders > 0) {
      dailyFees.addToken(row.token, row.bribes_to_holders, "Bribes");
      dailyHoldersRevenue.addToken(row.token, row.bribes_to_holders, "Bribes to holders");
    }
    if (row.bribes_to_validators > 0) {
      dailyFees.addToken(row.token, row.bribes_to_validators, "Bribes");
      dailySupplySideRevenue.addToken(row.token, row.bribes_to_validators, "Bribes to validators");
    }
    if (row.bribes_to_protocol > 0) {
      dailyFees.addToken(row.token, row.bribes_to_protocol, "Bribes");
      dailyProtocolRevenue.addToken(row.token, row.bribes_to_protocol, "Bribes to protocol");
    }
    if (row.bribes_to_stakers > 0) {
      // no collector payout that day means the sWBERA / LST split is unknown
      if (row.lst_share === null || row.lst_share === undefined) throw new Error("berachain-bribes: no IncentivesCollector payout to split IncentivesCollected");
      const toLstStakers = row.bribes_to_stakers * row.lst_share;
      dailyFees.addToken(row.token, row.bribes_to_stakers, "Bribes");
      dailyHoldersRevenue.addToken(row.token, row.bribes_to_stakers - toLstStakers, "Bribes to sWBERA stakers");
      dailySupplySideRevenue.addToken(row.token, toLstStakers, "Bribes to LST stakers");
    }
  });

  const dailyRevenue = dailyHoldersRevenue.clone();
  dailyRevenue.add(dailyProtocolRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Bribes are distributed to holders, validators, and the protocol.",
  Revenue: "Bribes not paid to validators: BGT booster incentives distributed to BGT holders and incentive fee taxes collected by the protocol until PoL Next (2026-07-07), and the sWBERA stakers' share of incentives collected since.",
  HoldersRevenue: "BGT booster incentives distributed to BGT holders via Berachain Reward Vaults until PoL Next (2026-07-07), and the sWBERA stakers' share of incentives collected since.",
  SupplySideRevenue: "Incentive tokens distributed to validators via IncentivesProcessed events, and since PoL Next (2026-07-07) the LST stakers' share of incentives collected.",
  ProtocolRevenue: "Incentive fee taxes collected by the protocol via IncentiveFeeCollected events.",
};

const breakdownMethodology = {
  Fees: {
    "Bribes": "Incentive tokens paid out by Berachain Reward Vaults when validators distribute rewards: the validator commission, the BGT booster share and the incentive fee until PoL Next (2026-07-07), the validator commission and the IncentivesCollector share since.",
  },
  Revenue: {
    "Bribes to holders": "BGT booster incentives distributed to BGT holders (BGTBoosterIncentivesProcessed), until PoL Next on 2026-07-07.",
    "Bribes to protocol": "Incentive fee taxes collected via IncentiveFeeCollected, until PoL Next on 2026-07-07.",
    "Bribes to sWBERA stakers": "Incentives net of validator commission sent to the IncentivesCollector (IncentivesCollected), auctioned for WBERA; the sWBERA vault's share of each payout, since PoL Next on 2026-07-07.",
  },
  HoldersRevenue: {
    "Bribes to holders": "BGT booster incentives distributed to BGT holders (BGTBoosterIncentivesProcessed), until PoL Next on 2026-07-07.",
    "Bribes to sWBERA stakers": "Incentives net of validator commission sent to the IncentivesCollector (IncentivesCollected), auctioned for WBERA; the sWBERA vault's share of each payout, since PoL Next on 2026-07-07.",
  },
  SupplySideRevenue: {
    "Bribes to validators": "Validator commission on incentives, paid to the validator operator (IncentivesProcessed).",
    "Bribes to LST stakers": "Incentives sent to the IncentivesCollector (IncentivesCollected): the registered LST staker vaults' share of each WBERA payout, split by stake, since PoL Next on 2026-07-07.",
  },
  ProtocolRevenue: {
    "Bribes to protocol": "Incentive fee taxes collected via IncentiveFeeCollected, until PoL Next on 2026-07-07.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: [CHAIN.BERACHAIN],
  start: "2025-02-05",
  methodology,
  breakdownMethodology,
  isExpensiveAdapter: true,
};

export default adapter;
