import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const CLEARING_HOUSE = '0xD218103918C19D0A10cf35300E4CfAfbD444c5fE'

const fetch = async (options: FetchOptions) => {
  const dailyLiquidationVolume = options.createBalances()

  const logs = await options.getLogs({
    target: CLEARING_HOUSE,
    eventAbi: 'event Liquidation(bytes32 indexed liquidatorSubaccount, bytes32 indexed liquidateeSubaccount, uint32 productId, bool isEncodedSpread, int128 amount, int128 amountQuote)',
  })

  logs.forEach((log: any) => {
    // `amountQuote` is the USD notional at the liquidation price (X18, signed by
    // position direction) https://github.com/nadohq/nado-contracts/blob/main/core/contracts/ClearinghouseLiq.sol#L588
    const quote = BigInt(log.amountQuote)
    const abs = quote < 0n ? -quote : quote
    dailyLiquidationVolume.addUSDValue(Number(abs) / 1e18)
  })

  return { dailyLiquidationVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.INK]: {
      fetch,
      start: '2025-11-17',
    },
  },
  methodology: {
    LiquidationVolume: 'Total USD notional of liquidated positions, from the `amountQuote` field of ClearingHouse `Liquidation` events.',
  },
}

export default adapter
