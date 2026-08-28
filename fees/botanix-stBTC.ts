import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getERC4626VaultsYield } from "../helpers/erc4626";


async function fetch(options: FetchOptions) {
  const stBTCToken = '0xF4586028FFdA7Eca636864F80f8a3f2589E33795'
  const balance = await getERC4626VaultsYield({ options, vaults: [stBTCToken] })
  const dailyFees = balance.clone(1)
  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
}

const methodology = {
  Fees: 'Fees are 50% of the chain gas fees.',
  SupplySideRevenue: '100% of the fees go to the stakers.',
  Revenue: 'No revenue for the protocol.',
}

export default {
  version: 2,
  fetch,
  start: '2025-09-03',
  chains: [CHAIN.BOTANIX],
  methodology,
}