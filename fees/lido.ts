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
const LIDO_V2_LAUNCH = '2023-05-15' // StakingRouter (per-module fee split) went live; earlier windows read 0
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
  // across staking modules by their active-validator share.
  let operatorShare: number
  let treasuryShare: number
  if (options.dateString < LIDO_V2_LAUNCH) {
    // Before Lido V2 the StakingRouter didn't exist, so calling it reverts. The 10% fee was a
    // fixed 5%/5% split for the whole V1 era (the 2022-07-15 insurance->treasury redirect,
    // research.lido.fi/t/.../2528, left the operator share unchanged at 5%), so a flat 50/50
    // operator/treasury split is accurate. Booking the operator share as Revenue (the old
    // treasuryShare=1 fallback) overstated protocol Revenue ~2x for this era.
    operatorShare = 0.5
    treasuryShare = 0.5
  } else {
    // Read the live aggregate split off the StakingRouter at the window's end block so historical
    // accuracy follows the on-chain rate (e.g. module 1 changed from 5%/5% to 3.5%/6.5% on
    // 2025-12-24, tx 0x470e74a0…).
    const feeSplit = await options.toApi.call({
      target: LIDO_STAKING_ROUTER,
      abi: STAKING_ROUTER_FEE_DISTRIBUTION_ABI,
    })
    const modulesFeeBp = Number(feeSplit.modulesFee)
    const treasuryFeeBp = Number(feeSplit.treasuryFee)
    const totalFeeBp = modulesFeeBp + treasuryFeeBp
    // Post-V2 the StakingRouter always returns a configured non-zero split, so a 0 here is a
    // transient read fault, not a real allocation. Fail loudly rather than silently guessing a
    // ratio, which would mis-split protocol Revenue vs the node-operator supply-side share.
    if (totalFeeBp === 0) throw new Error(`Lido: StakingRouter returned a zero fee split for ${options.dateString}; refusing to guess the treasury/operator ratio`)
    operatorShare = modulesFeeBp / totalFeeBp
    treasuryShare = treasuryFeeBp / totalFeeBp
  }

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
    Revenue: "Lido takes a 10% fee on staking rewards; Revenue is only the DAO-treasury portion of that fee (net of the node-operator share, which is a cost of production booked as SupplySideRevenue). From Lido V2 (2023-05-15) the treasury/operator split is the validator-share-weighted aggregate read live from the StakingRouter; before V2 the split was a fixed 5%/5%, so half the fee is treasury.",
    HoldersRevenue: "Tracks LIDO bought back by the DAO as part of the LDO Accumulation Program",
    ProtocolRevenue: "DAO-treasury portion of the 10% fee (same as Revenue); excludes the node-operator share.",
    SupplySideRevenue: "Staking rewards earned by stETH holders plus the node-operator share of the 10% fee (paid to operators for running validators)."
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators.',
      [METRIC.MEV_REWARDS]: 'ETH rewards from MEV tips on ETH execution layer paid by block builders.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'DAO treasury share of staking rewards. From Lido V2 (2023-05-15) the ratio is read live from StakingRouter.getStakingFeeAggregateDistributionE4Precision() — treasuryFee / (modulesFee + treasuryFee); before V2 it defaults to the fixed 5%/5% split (treasury share 0.5).',
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
