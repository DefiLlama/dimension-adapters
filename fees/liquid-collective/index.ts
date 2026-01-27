// https://docs.liquidcollective.io/v1/faqs#what-is-the-protocol-service-fee
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const lsETH = "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549";
const MevFeeRecipient = "0x7d16d2c4e96bcfc8f815e15b771ac847ecbdb48b";
const ProtocolFeeRate = 0.1; // 10%

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const totalSupplyBefore = await options.fromApi.call({
    target: lsETH,
    abi: 'uint256:totalSupply',
  })
  const totalSupplyAfter = await options.toApi.call({
    target: lsETH,
    abi: 'uint256:totalSupply',
  })

  const totalUnderlyingSupplyBefore = await options.fromApi.call({
    target: lsETH,
    abi: 'uint256:totalUnderlyingSupply',
  })
  const totalUnderlyingSupplyAfter = await options.toApi.call({
    target: lsETH,
    abi: 'uint256:totalUnderlyingSupply',
  })

  const dailyLsEthHoldersYield = (totalUnderlyingSupplyAfter / totalSupplyAfter - totalUnderlyingSupplyBefore / totalSupplyBefore) * (totalSupplyAfter / 1e18) * 1e18;

  // MEV and execution rewards
  let mevRewards = 0
  const transactions = await sdk.indexer.getTransactions({
    chain: options.chain,
    transactionType: 'to',
    addresses: [MevFeeRecipient],
    from_block: Number(options.fromApi.block),
    to_block: Number(options.toApi.block),
  })
  if (transactions) {
    for (const tx of transactions) {
      mevRewards += Number(tx.value)
    }
  }
  
  const dfExcludeMev = dailyLsEthHoldersYield - mevRewards;
  
  dailyFees.addGasToken(dfExcludeMev, METRIC.STAKING_REWARDS)
  dailyRevenue.addGasToken(dfExcludeMev * ProtocolFeeRate, METRIC.STAKING_REWARDS)
  dailySupplySideRevenue.addGasToken(dfExcludeMev * (1 - ProtocolFeeRate), METRIC.STAKING_REWARDS)
  
  dailyFees.addGasToken(mevRewards, METRIC.MEV_REWARDS)
  dailyRevenue.addGasToken(mevRewards * ProtocolFeeRate, METRIC.MEV_REWARDS)
  dailySupplySideRevenue.addGasToken(mevRewards * (1 - ProtocolFeeRate), METRIC.MEV_REWARDS)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-11-19',
    },
  },
  methodology: {
    Fees: "Total ETH staking rewards from all validators.",
    Revenue: "Liquid Collective charges 10% ETH staking rewards.",
    ProtocolRevenue: "Liquid Collective charges 10% ETH staking rewards.",
    SupplySideRevenue: '90% staking rewards are distributed to lsETH holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators.',
      [METRIC.MEV_REWARDS]: 'ETH rewards from MEV tips on ETH execution layer paid by block builders.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to Mantle.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to Mantle.',
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to Mantle.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to Mantle.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to stakers.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to stakers.',
    },
  }
};

export default adapter;
