import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { ZeroAddress } from "ethers";

// docs from Binance: https://www.binance.com/en/earn/ethereum-staking
// fees data from source: https://defirate.com/staking
const methodology = {
  Fees: 'Total validators fees and rewards from staked ETH.',
  SupplySideRevenue: '90% staking rewards are distributed to WBETH holders.',
  ProtocolRevenue: '10% staking rewards are charged by Binance.',
  Revenue: '10% staking rewards are charged by Binance.'
}

const breakdownMethodology = {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Staking rewards earned by all staked ETH.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: '10% staking rewards are charged by Binance.',
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: '10% staking rewards are charged by Binance.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: '90% staking rewards are distributed to WBETH holders.',
    },
  }

const WBETH = ADDRESSES.bsc.wBETH
const ETH_ON_BSC = ADDRESSES.bsc.ETH

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()

  const exchangeRateBefore = await options.fromApi.call({
    target: WBETH,
    abi: 'uint256:exchangeRate',
  })
  const exchangeRateAfter = await options.toApi.call({
    target: WBETH,
    abi: 'uint256:exchangeRate',
  })
  const totalSupply = await options.api.call({
    target: WBETH,
    abi: 'uint256:totalSupply',
  })

  // fees distributed to WBETH holders are deducted by 10% protocol fees
  // it was 90% of total rewards earned from ETH staking
  const df = totalSupply * (exchangeRateAfter - exchangeRateBefore) / 0.9 / 1e18

  let token = options.chain === CHAIN.BSC ? ETH_ON_BSC : ZeroAddress

  dailyFees.add(token, df, METRIC.STAKING_REWARDS)

  const dailyProtocolRevenue = dailyFees.clone(0.1, METRIC.STAKING_REWARDS)
  const dailySupplySideRevenue = dailyFees.clone(0.9, METRIC.STAKING_REWARDS)

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-04-20',
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2023-04-20',
    },
  },
};

export default adapter;
