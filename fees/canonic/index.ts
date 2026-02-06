import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const USDM  = '0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7'
const BTC_B = '0xB0F70C0bD6FD87dbEb7C10dC692a2a6106817072'
const WETH  = '0x4200000000000000000000000000000000000006'
const USDT0 = '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb'

const FEE_DENOM = 1_000_000n

const MAOBS = [
  { address: '0xaD7e5CBfB535ceC8d2E58Dca17b11d9bA76f555E', base: BTC_B, quote: USDM },  // BTC.b / USDm
  { address: '0x23469683e25b780DFDC11410a8e83c923caDF125', base: WETH,  quote: USDM },  // WETH  / USDm
  { address: '0xDf1576c3C82C9f8B759C69f4cF256061C6Fe1f9e', base: USDT0, quote: USDM },  // USDT0 / USDm
]

const EVENT_ABI = 'event RungFilled(address indexed taker, bool indexed isBuy, uint16 indexed rung, uint256 baseAmount, uint256 quoteAmount, uint256 priceE18)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyVolume = options.createBalances()

  for (const maob of MAOBS) {
    const takerFee = await options.api.call({ target: maob.address, abi: 'uint32:takerFee' })
    const logs = await options.getLogs({ target: maob.address, eventAbi: EVENT_ABI })

    for (const log of logs) {
      dailyVolume.add(maob.quote, log.quoteAmount)

      // Buy: fee charged on base output; Sell: fee charged on quote output
      // Use ceiling division to match on-chain Math.Rounding.Ceil
      const takerFeeBig = BigInt(takerFee)
      if (log.isBuy) {
        const amount = BigInt(log.baseAmount)
        const fee = (amount * takerFeeBig + FEE_DENOM - 1n) / FEE_DENOM
        dailyFees.add(maob.base, fee)
      } else {
        const amount = BigInt(log.quoteAmount)
        const fee = (amount * takerFeeBig + FEE_DENOM - 1n) / FEE_DENOM
        dailyFees.add(maob.quote, fee)
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,            // 100% of fees go to protocol
    dailyProtocolRevenue: dailyFees,    // collected by feeCollector
    dailySupplySideRevenue: 0,          // LPs earn from spread, not from fees
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MEGAETH]: {
      fetch,
      start: '2026-02-09', // TODO: update to actual first trade date
      meta: {
        methodology: {
          Fees: 'Taker fees charged on every trade. Buy orders pay fees in the base token, sell orders pay in the quote token.',
          UserFees: 'Same as Fees — all fees are paid by takers.',
          Revenue: '100% of taker fees are sent to the protocol fee collector.',
          ProtocolRevenue: 'All collected fees go to the protocol treasury.',
          SupplySideRevenue: 'CLP vault LPs earn from market-making spread, not from protocol fees.',
        },
      },
    },
  },
}

export default adapter
