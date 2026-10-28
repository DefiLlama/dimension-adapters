import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { dolomiteMarginAddresses } from '../../fees/dolomite'

const balanceUpdate = '((bool sign, uint256 value) deltaWei, (bool sign, uint128 value) newPar)'

const abis = {
  LogLiquidate: `event LogLiquidate(address indexed solidAccountOwner, uint256 solidAccountNumber, address indexed liquidAccountOwner, uint256 liquidAccountNumber, uint256 heldMarket, uint256 owedMarket, ${balanceUpdate} solidHeldUpdate, ${balanceUpdate} solidOwedUpdate, ${balanceUpdate} liquidHeldUpdate, ${balanceUpdate} liquidOwedUpdate)`,
  getMarketTokenAddress: 'function getMarketTokenAddress(uint256 marketId) view returns (address)',
  UNDERLYING_TOKEN: 'address:UNDERLYING_TOKEN',
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()
  const dolomiteMargin = dolomiteMarginAddresses[options.chain]

  const logs: any[] = await options.getLogs({ target: dolomiteMargin, eventAbi: abis.LogLiquidate })
  if (!logs.length) return { dailyCollateralLiquidated }

  const markets = [...new Set(logs.map((l) => Number(l.heldMarket)))]
  const tokens: string[] = await options.api.multiCall({ abi: abis.getMarketTokenAddress, calls: markets.map((m) => ({ target: dolomiteMargin, params: [m] })) })
  // isolation mode markets hold a factory token minted 1:1 against its UNDERLYING_TOKEN, book the underlying
  const underlyings = await options.api.multiCall({ abi: abis.UNDERLYING_TOKEN, calls: tokens, permitFailure: true })
  const marketToken: Record<number, string> = {}
  markets.forEach((m, i) => { marketToken[m] = underlyings[i] ?? tokens[i] })

  for (const log of logs) {
    // collateral taken from the liquidated account; its held balance always decreases
    dailyCollateralLiquidated.add(marketToken[Number(log.heldMarket)], log.liquidHeldUpdate.deltaWei.value)
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2022-10-03' },
    [CHAIN.BERACHAIN]: { start: '2025-01-20' },
    [CHAIN.ETHEREUM]: { start: '2025-06-22' },
    [CHAIN.MANTLE]: { start: '2024-04-28' },
  },
  methodology: {
    CollateralLiquidated: 'Collateral removed from liquidated accounts in DolomiteMargin LogLiquidate events (liquidHeldUpdate). Isolation mode collateral is booked as its underlying token, which the isolation mode factory wraps 1:1.',
  },
}

export default adapter
