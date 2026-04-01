import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
    },
  },
};

export default adapter;

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const eventAbi = 'event Swapped (address indexed account, address indexed src, address indexed dst, uint256 amount, uint256 result, uint256 srcBalance, uint256 dstBalance, uint256 totalSupply, address referral)'
  const pools = await options.api.call({ abi: 'address[]:getAllPools', target: '0x71CD6666064C3A1354a3B4dca5fA1E2D3ee7D303' })
  const logs = await options.getLogs({ targets: pools, eventAbi })
  logs.forEach(log => dailyVolume.add(log.dst, log.dstBalance))
  return { dailyVolume, dailyFees: dailyVolume.clone(0.003) }
}