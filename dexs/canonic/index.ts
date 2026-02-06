import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const USDM = '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7'

const MAOBS = [
  '0xaD7e5CBfB535ceC8d2E58Dca17b11d9bA76f555E', // BTC.b / USDm
  '0x23469683e25b780DFDC11410a8e83c923caDF125', // WETH  / USDm
  '0xDf1576c3C82C9f8B759C69f4cF256061C6Fe1f9e', // USDT0 / USDm
]

const EVENT_ABI = 'event RungFilled(address indexed taker, bool indexed isBuy, uint16 indexed rung, uint256 baseAmount, uint256 quoteAmount, uint256 priceE18)'

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()

  for (const maob of MAOBS) {
    const logs = await options.getLogs({ target: maob, eventAbi: EVENT_ABI })
    for (const log of logs) {
      // quoteAmount is denominated in USDm (USD-pegged) for all markets
      dailyVolume.add(USDM, log.quoteAmount)
    }
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: '2026-02-09', // TODO: update to actual first trade date
    },
  },
}

export default adapter
