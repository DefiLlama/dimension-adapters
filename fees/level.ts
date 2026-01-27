import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { ZeroAddress } from "ethers";

const methodology = {
  Fees: 'Total yield were generated from backing collateral assets.',
  SupplySideRevenue: 'Total yield are distributed to lvlUSD stakers.',
  ProtocolRevenue: 'The amount of yield are collected by Level protocol.',
}

const lvlUSD = '0x7C1156E515aA1A2E851674120074968C905aAF37'
const slvlUSD = '0x4737D9b4592B40d51e110b94c9C043c6654067Ae'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()

  const exchangeRateBefore = await options.fromApi.call({
    target: slvlUSD,
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    params: ['1000000000000000000'],
  })
  const exchangeRateAfter = await options.toApi.call({
    target: slvlUSD,
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    params: ['1000000000000000000'],
  })
  const totalAssets = await options.api.call({
    target: slvlUSD,
    abi: 'uint256:totalAssets',
  })

  // fees distributed to slvlUSD holders - they are lvlUSD stakers
  const totalYield = totalAssets * (exchangeRateAfter - exchangeRateBefore) / 1e18

  dailyFees.add(lvlUSD, totalYield)
  const dailySupplySideRevenue = dailyFees.clone()

  return {
    dailyFees,
    dailySupplySideRevenue,

    // level get 0% fees for now
    // https://level-money.gitbook.io/docs/how-it-works/lvlusd#yield-and-reward-distribution
    dailyProtocolRevenue: 0,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2024-11-09',
    },
  },
  methodology,
};

export default adapter;
