import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";

// docs: https://docs.mantle.xyz/meth/components/smart-contracts/staking-meth
// mETH treasury takes 10%: https://etherscan.io/address/0x1766be66fBb0a1883d41B4cfB0a533c5249D3b82#readProxyContract#F5
const methodology = {
  Fees: 'Total validators fees and rewards from staked ETH.',
  Revenue: '10% staking rewards are charged by mETH Protocol Treasury.',
  SupplySideRevenue: '90% staking rewards are distributed to mETH holders.',
  ProtocolRevenue: '10% staking rewards are charged by mETH Protocol Treasury.',
}

const mETH = '0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f'

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()

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

  // add ETH fees
  dailyFees.addGasToken(df)

  const dailyProtocolRevenue = dailyFees.clone(0.1)
  const dailySupplySideRevenue = dailyFees.clone(0.9)

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-10-07',
    },
  },
};

export default adapter;
