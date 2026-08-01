import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from '../../helpers/chains'

const VAULT_ADDRESS = '0x22787c26bb0ab0d331eb840ff010855a70a0dca6'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()

  // Increase position fees
  const increasePositionLogs = await options.getLogs({
    target: VAULT_ADDRESS,
    eventAbi: 'event IncreasePosition(bytes32 indexed key, address account, address collateralToken, address indexToken, uint256 collateralValue, uint256 sizeChanged, uint8 side, uint256 indexPrice, uint256 feeValue)',
  })

  // Decrease position fees
  const decreasePositionLogs = await options.getLogs({
    target: VAULT_ADDRESS,
    eventAbi: 'event DecreasePosition(bytes32 indexed key, address account, address collateralToken, address indexToken, uint256 collateralChanged, uint256 sizeChanged, uint8 side, uint256 indexPrice, int256 pnl, uint256 feeValue)',
  })
  
  // Add position fees (back to 1e30 division)
  increasePositionLogs.concat(decreasePositionLogs).forEach((log: any) => {
    dailyVolume.addUSDValue(Number(log.sizeChanged) / 1e30)
  })

  return { dailyVolume }
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
}

export default adapter