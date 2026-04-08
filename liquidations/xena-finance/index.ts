import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

const VAULT = '0x22787c26bb0ab0d331eb840ff010855a70a0dca6'

const fetch = async (options: FetchOptions) => {
  const dailyLiquidationCollateral = options.createBalances()

  const logs = await options.getLogs({
    target: VAULT,
    eventAbi: 'event LiquidatePosition(bytes32 indexed key, address account, address collateralToken, address indexToken, uint8 side, uint256 size, uint256 collateralValue, uint256 reserveAmount, uint256 indexPrice, int256 pnl, uint256 feeValue)',
  })

  logs.forEach((log: any) => {
    // collateralValue is USD with 1e30 precision, same as GMX v1
    dailyLiquidationCollateral.addUSDValue(Number(log.collateralValue) / 1e30)
  })

  return { dailyLiquidationCollateral }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-10-09',
    },
  },
  methodology: {
    LiquidationCollateral: 'Total USD value of collateral lost by liquidated position owners from LiquidatePosition events.',
  },
}

export default adapter
