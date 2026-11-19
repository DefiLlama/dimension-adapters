// https://docs.liquidcollective.io/v1/faqs#what-is-the-protocol-service-fee
import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const lsETH = "0x8c1BEd5b9a0928467c9B1341Da1D7BD5e10b6549";
const MevFeeRecipient = "0x7d16d2c4e96bcfc8f815e15b771ac847ecbdb48b";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // River's service fee (getGlobalFee, in bps). It was 15% at launch and was cut to 10% at block
  // 19554925 (2024-03-31 15:41 UTC, SetGlobalFee), so read it per period instead of hardcoding one rate.
  // Read at the window start: the 2024-03-31 oracle report (~12:14 UTC) landed before the cut and was
  // still charged 15%, and the hour of the cut itself has no report.
  const globalFeeBps = await options.fromApi.call({ target: lsETH, abi: 'uint256:getGlobalFee' });
  const protocolFeeRate = Number(globalFeeBps) / 1e4;

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

  // The service fee is charged by minting new lsETH to the collector, not by reducing the
  // exchange rate, so the rate growth below is already net of it. Gross it back up to get
  // the total rewards before the fee.
  const lsEthHoldersYield = (totalUnderlyingSupplyAfter / totalSupplyAfter - totalUnderlyingSupplyBefore / totalSupplyBefore) * (totalSupplyAfter / 1e18) * 1e18;
  const dailyLsEthHoldersYield = lsEthHoldersYield / (1 - protocolFeeRate);

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
  dailyRevenue.addGasToken(dfExcludeMev * protocolFeeRate, METRIC.STAKING_REWARDS)
  dailySupplySideRevenue.addGasToken(dfExcludeMev * (1 - protocolFeeRate), METRIC.STAKING_REWARDS)
  
  dailyFees.addGasToken(mevRewards, METRIC.MEV_REWARDS)
  dailyRevenue.addGasToken(mevRewards * protocolFeeRate, METRIC.MEV_REWARDS)
  dailySupplySideRevenue.addGasToken(mevRewards * (1 - protocolFeeRate), METRIC.MEV_REWARDS)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-11-19',
    },
  },
  methodology: {
    Fees: "Total ETH staking rewards from all validators.",
    Revenue: "Liquid Collective's service fee on ETH staking rewards (15% through the 2024-03-31 report, 10% after).",
    ProtocolRevenue: "Liquid Collective's service fee on ETH staking rewards (15% through the 2024-03-31 report, 10% after).",
    SupplySideRevenue: "Staking rewards left to lsETH holders after the service fee (85% through the 2024-03-31 report, 90% after).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'ETH rewards from running Beacon chain validators.',
      [METRIC.MEV_REWARDS]: 'ETH rewards from MEV tips on ETH execution layer paid by block builders.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to Liquid Collective.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to Liquid Collective.',
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to Liquid Collective.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to Liquid Collective.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'Share of ETH rewards from running Beacon chain validators to stakers.',
      [METRIC.MEV_REWARDS]: 'Share of ETH rewards from MEV tips on ETH execution layer paid by block builders to stakers.',
    },
  }
};

export default adapter;
