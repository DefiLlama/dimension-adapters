import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { ZeroAddress } from "ethers";

// docs from Binance: https://www.binance.com/en/earn/ethereum-staking
// fees data from source: https://defirate.com/staking
const methodology = {
  Fees: 'Total validators fees and rewards from staked ETH.',
  SupplySideRevenue: '75% staking rewards are distributed to WBETH holders.',
  ProtocolRevenue: '25% staking rewards are charged by Binance.',
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

  // fees distributed to WBETH holders are deducted by 25% protocol fees
  // it was 75% of total rewards earned from ETH staking
  const df = totalSupply * (exchangeRateAfter - exchangeRateBefore) / 0.75 / 1e18

  let token = options.chain === CHAIN.BSC ? ETH_ON_BSC : ZeroAddress

  dailyFees.add(token, df)

  const dailyProtocolRevenue = dailyFees.clone(0.25)
  const dailySupplySideRevenue = dailyFees.clone(0.75)

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-04-20',
      meta: {
        methodology,
      },
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2023-04-20',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
