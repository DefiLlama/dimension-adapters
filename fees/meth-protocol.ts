import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";

// docs: https://docs.mantle.xyz/meth/components/smart-contracts/staking-meth
// mETH treasury takes 10%: https://etherscan.io/address/0x1766be66fBb0a1883d41B4cfB0a533c5249D3b82#readProxyContract#F5

const mETH = '0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f'
const ExecutionRewardsVault = '0xd6e4aa932147a3fe5311da1b67d9e73da06f9cef'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const ONE = (1e18).toString()
  const exchangeRateBefore = await options.fromApi.call({
    target: mETH,
    abi: 'function mETHToETH(uint256) view returns (uint256)',
    params: [ONE],
  })
  const exchangeRateAfter = await options.toApi.call({
    target: mETH,
    abi: 'function mETHToETH(uint256) view returns (uint256)',
    params: [ONE],
  })
  const totalSupply = await options.api.call({
    target: mETH,
    abi: 'uint256:totalControlled',
  })

  // fees distributed to mETH holders are deducted by 10% protocol fees
  // it was 90% of total rewards earned from ETH staking
  const df = totalSupply * (exchangeRateAfter - exchangeRateBefore) / 0.9 / 1e18

  // MEV and execution rewards
  let mevRewards = 0
  const transactions = await sdk.indexer.getTransactions({
    chain: options.chain,
    transactionType: 'to',
    addresses: [ExecutionRewardsVault],
    from_block: Number(options.fromApi.block),
    to_block: Number(options.toApi.block),
  })
  for (const tx of transactions) {
    mevRewards += Number(tx.value)
  }
  
  const dfExcludeMev = df - mevRewards;
  
  dailyFees.addGasToken(dfExcludeMev, METRIC.STAKING_REWARDS)
  dailyRevenue.addGasToken(dfExcludeMev * 0.1, METRIC.STAKING_REWARDS)
  dailySupplySideRevenue.addGasToken(dfExcludeMev * 0.9, METRIC.STAKING_REWARDS)

  dailyFees.addGasToken(mevRewards, METRIC.MEV_REWARDS)
  dailyRevenue.addGasToken(mevRewards * 0.1, METRIC.MEV_REWARDS)
  dailySupplySideRevenue.addGasToken(mevRewards * 0.9, METRIC.MEV_REWARDS)

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-10-07',
    },
  },
  methodology: {
    Fees: 'Total validators fees and rewards from staked ETH.',
    Revenue: '10% staking rewards are charged by mETH Protocol Treasury.',
    SupplySideRevenue: '90% staking rewards are distributed to mETH holders.',
    ProtocolRevenue: '10% staking rewards are charged by mETH Protocol Treasury.',
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
