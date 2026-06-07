import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { addTokensReceived } from "../helpers/token";
import coreAssets from "../helpers/coreAssets.json"

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('F7qb71hWab6SuRL5sf6LQLTpNahmqMsBnnweYHzLGUyG'),
}

const PROTOCOL_FEE_RATIO = 0.1 // 10%
const LIDO_MEV_REWARDS_VAULT = '0x388c818ca8b9251b393131c08a736a67ccb19297';
const LIDO_STAKING_ROUTER = '0xFdDf38947aFB03C621C71b06C9C70bce73f12999';
const STAKING_ROUTER_FEE_DISTRIBUTION_ABI = 'function getStakingFeeAggregateDistributionE4Precision() view returns (uint16 modulesFee, uint16 treasuryFee)';
const LIDO_AGENT = '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c'
const BUYBACKS_SAFE = '0xf6F0732c1e9971497342C295141566E6F1A31e96'

const fetch = async (options: FetchOptions) => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(options.toTimestamp) / 86400)

  const graphQuery = gql
    `{
    financialsDailySnapshot(id: ${dateId}) {
        dailyTotalRevenueUSD
        dailyProtocolSideRevenueUSD
        cumulativeTotalRevenueUSD
        cumulativeProtocolSideRevenueUSD
        dailySupplySideRevenueUSD
        cumulativeSupplySideRevenueUSD
    }
  }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyTotalRevenueUSD = Number(graphRes.financialsDailySnapshot.dailyTotalRevenueUSD)
  const dailyProtocolRevenueUSD = dailyTotalRevenueUSD * PROTOCOL_FEE_RATIO
  const dailySupplySideRevenueUSD = dailyTotalRevenueUSD - dailyProtocolRevenueUSD

  // Lido's 10% protocol take is split between node operators and the DAO treasury, weighted
  // across staking modules by their active-validator share. Read the live aggregate split off
  // the StakingRouter at the window's end block so historical accuracy follows the on-chain
  // rate (e.g. module 1 changed from 5%/5% to 3.5%/6.5% on 2025-12-24, tx 0x470e74a0…).
  const feeSplit = await options.toApi.call({
    target: LIDO_STAKING_ROUTER,
    abi: STAKING_ROUTER_FEE_DISTRIBUTION_ABI,
  })
  const modulesFeeBp = Number(feeSplit.modulesFee)
  const treasuryFeeBp = Number(feeSplit.treasuryFee)
  const totalFeeBp = modulesFeeBp + treasuryFeeBp
  // Fallback when the StakingRouter read yields a zero total (transient RPC fault or a
  // governance state where module fees are unset). Defaulting treasuryShare to 1 keeps
  // total Revenue unchanged in degraded reads and only loses the breakdown for those windows.
  const operatorShare = totalFeeBp > 0 ? modulesFeeBp / totalFeeBp : 0
  const treasuryShare = totalFeeBp > 0 ? treasuryFeeBp / totalFeeBp : 1

  // MEV and execution rewards
  const mevFeesETH = options.createBalances()
  const transactions = await sdk.indexer.getTransactions({
    chain: options.chain,
    transactionType: 'to',
    addresses: [LIDO_MEV_REWARDS_VAULT],
    from_block: Number(options.fromApi.block),
    to_block: Number(options.toApi.block),
  })
  if (transactions) {
    for (const tx of transactions) {
      mevFeesETH.addGasToken(tx.value)
    }
  }

  const totalMevFees = await mevFeesETH.getUSDValue()
  const protocolMevFees = totalMevFees * PROTOCOL_FEE_RATIO
  const supplySideMevFees = totalMevFees - protocolMevFees

  const stakingProtocolFees = dailyProtocolRevenueUSD - protocolMevFees
  const stakingSupplySide = dailySupplySideRevenueUSD - supplySideMevFees

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  dailyFees.addUSDValue(dailyTotalRevenueUSD - totalMevFees, METRIC.STAKING_REWARDS)
  dailyFees.addUSDValue(totalMevFees, METRIC.MEV_REWARDS)

  dailySupplySideRevenue.addUSDValue(stakingSupplySide, 'Staking rewards to ETH stakers')
  dailySupplySideRevenue.addUSDValue(supplySideMevFees, 'MEV rewards to ETH stakers')

  // Split the protocol take into the DAO-treasury share (kept by the Lido DAO) and the
  // module-operator share (paid to node operators). Totals are preserved; only the breakdown
  // gains granularity. Operator and treasury shares are summed across staking + MEV sources.
  dailyRevenue.addUSDValue(stakingProtocolFees * treasuryShare, METRIC.STAKING_REWARDS)
  dailyRevenue.addUSDValue(protocolMevFees * treasuryShare, METRIC.MEV_REWARDS)

  dailySupplySideRevenue.addUSDValue(stakingProtocolFees * operatorShare, 'Staking rewards to node operators')
  dailySupplySideRevenue.addUSDValue(protocolMevFees * operatorShare, 'MEV rewards to node operators')

  const buybacks = await addTokensReceived({
    options,
    target: LIDO_AGENT,
    fromAdddesses: [BUYBACKS_SAFE],
    tokens: [coreAssets.ethereum.LIDO] 
  })
  dailyHoldersRevenue.addBalances(buybacks, "LDO Accumulation Program")


  return {
    dailyFees,
    dailyUserFees: 0,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue
  };
};

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2020-12-19',
  methodology: {
    Fees: "Staking rewards earned by all staked ETH",
    UserFees: "Lido takes no fees from users.",
    Revenue: "Lido applies a 10% fee on staking rewards (validator-share-weighted aggregate across all active staking modules), part of which goes to the DAO treasury.",
    HoldersRevenue: "Tracks LIDO bought back by the DAO as part of the LDO Accumulation Program",
    ProtocolRevenue: "Lido applies a 10% fee on staking rewards (validator-share-weighted aggregate across all active staking modules), part of which goes to the DAO treasury.",
    SupplySideRevenue: "Staking rewards earned by stETH holders and node operators"
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators.',
      [METRIC.MEV_REWARDS]: 'ETH rewards from MEV tips on ETH execution layer paid by block builders.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'DAO treasury share of staking rewards. Ratio read live from StakingRouter.getStakingFeeAggregateDistributionE4Precision() — treasuryFee / (modulesFee + treasuryFee).',
      [METRIC.MEV_REWARDS]: 'DAO treasury share of MEV rewards.',
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: 'DAO treasury share of staking rewards.',
      [METRIC.MEV_REWARDS]: 'DAO treasury share of MEV rewards.',
    },
    SupplySideRevenue: {
      'Staking rewards to ETH stakers': 'Share of ETH rewards from running Beacon chain validators to stakers.',
      'MEV rewards to ETH stakers': 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to stakers.',
      'Staking rewards to node operators': 'Share of ETH rewards from running Beacon chain validators to node operators.',
      'MEV rewards to node operators': 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to node operators.',
    },
    HoldersRevenue: {
      'LDO Accumulation Program': 'Tracks LIDO bought back by the DAO.'
    }
  }
}

export default adapter;
