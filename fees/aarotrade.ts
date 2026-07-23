import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";

// AaroLauncher: https://robinhoodchain.blockscout.com/address/0xDb0Fc3298FBf4A831fCcd032741b271562B97Af9
// Each launched memecoin gets a Uniswap V3 position owned by the launcher; anyone can call
// collectFees(token) to pull the accrued swap fees, split 80% creator / 20% treasury - split
// verified directly off a real FeesCollected log (both the WETH and token amounts came out to
// exactly 20% treasury / 80% creator).
const AaroLauncher = '0xDb0Fc3298FBf4A831fCcd032741b271562B97Af9'

const FeesCollectedEvent = 'event FeesCollected(address indexed token, address indexed creator, uint256 wethCreator, uint256 wethTreasury, uint256 tokenCreator, uint256 tokenTreasury)'

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const logs = await options.getLogs({ targets: [AaroLauncher], eventAbi: FeesCollectedEvent })

  for (const log of logs) {
    dailyFees.addGasToken(log.wethCreator, METRIC.SWAP_FEES)
    dailyFees.addGasToken(log.wethTreasury, METRIC.SWAP_FEES)
    dailyFees.add(log.token, log.tokenCreator, METRIC.SWAP_FEES)
    dailyFees.add(log.token, log.tokenTreasury, METRIC.SWAP_FEES)

    dailySupplySideRevenue.addGasToken(log.wethCreator, METRIC.CREATOR_FEES)
    dailySupplySideRevenue.add(log.token, log.tokenCreator, METRIC.CREATOR_FEES)

    dailyRevenue.addGasToken(log.wethTreasury, METRIC.PROTOCOL_FEES)
    dailyRevenue.add(log.token, log.tokenTreasury, METRIC.PROTOCOL_FEES) 
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }
}

const methodology = {
  Fees: 'Uniswap V3 swap fees accrued on each launched token\'s pool, collected via the AaroLauncher contract.',
  Revenue: 'The 20% treasury share of collected swap fees.',
  SupplySideRevenue: 'The 80% creator share of collected swap fees.',
  ProtocolRevenue: 'The 20% treasury share of collected swap fees.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Swap fees accrued on each token\'s Uniswap V3 pool.',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: '20% treasury cut of collected swap fees.',
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: '80% creator cut of collected swap fees.',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: '20% treasury cut of collected swap fees.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-10',
  methodology,
  breakdownMethodology,
  doublecounted: true, //uniswap v3
}

export default adapter;
