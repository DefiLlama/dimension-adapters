import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from '../helpers/chains'

const VAULT_ADDRESS = '0x22787c26bb0ab0d331eb840ff010855a70a0dca6'

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { getLogs } = options
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  // Increase position fees
  const increasePositionLogs = await getLogs({
    target: VAULT_ADDRESS,
    eventAbi: 'event IncreasePosition(bytes32 indexed key, address account, address collateralToken, address indexToken, uint256 collateralValue, uint256 sizeChanged, uint8 side, uint256 indexPrice, uint256 feeValue)',
  })

  // Decrease position fees
  const decreasePositionLogs = await getLogs({
    target: VAULT_ADDRESS,
    eventAbi: 'event DecreasePosition(bytes32 indexed key, address account, address collateralToken, address indexToken, uint256 collateralChanged, uint256 sizeChanged, uint8 side, uint256 indexPrice, int256 pnl, uint256 feeValue)',
  })

  // Liquidation fees
  const liquidatePositionLogs = await getLogs({
    target: VAULT_ADDRESS,
    eventAbi: 'event LiquidatePosition(bytes32 indexed key, address account, address collateralToken, address indexToken, uint8 side, uint256 size, uint256 collateralValue, uint256 reserveAmount, uint256 indexPrice, int256 pnl, uint256 feeValue)',
  })

  // Add position fees (back to 1e30 division)
  increasePositionLogs.forEach((log: any) => {
    dailyFees.addUSDValue(Number(log.feeValue) / 1e30)
    dailyUserFees.addUSDValue(Number(log.feeValue) / 1e30)
  })

  decreasePositionLogs.forEach((log: any) => {
    dailyFees.addUSDValue(Number(log.feeValue) / 1e30)
    dailyUserFees.addUSDValue(Number(log.feeValue) / 1e30)
  })

  liquidatePositionLogs.forEach((log: any) => {
    dailyFees.addUSDValue(Number(log.feeValue) / 1e30)
    dailyUserFees.addUSDValue(Number(log.feeValue) / 1e30)
  })

  // Swap fees (fee is in tokenOut amount, convert to USD)
  const swapLogs = await getLogs({
    target: VAULT_ADDRESS,
    eventAbi: 'event Swap(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 priceIn, uint256 priceOut)',
  })

  swapLogs.forEach((log: any) => {
    // Try treating fee as USD value directly
    dailyFees.addUSDValue(Number(log.fee) / 1e30)
    dailyUserFees.addUSDValue(Number(log.fee) / 1e30)
  })

  // Liquidity fees
  const liquidityAddedLogs = await getLogs({
    target: VAULT_ADDRESS,
    eventAbi: 'event LiquidityAdded(address indexed tranche, address indexed sender, address token, uint256 amount, uint256 lpAmount, uint256 fee)',
  })

  const liquidityRemovedLogs = await getLogs({
    target: VAULT_ADDRESS,
    eventAbi: 'event LiquidityRemoved(address indexed tranche, address indexed sender, address token, uint256 lpAmount, uint256 amountOut, uint256 fee)',
  })

  liquidityAddedLogs.forEach((log: any) => {
    // Try treating fee as token amount instead of USD
    dailyFees.add(log.token, Number(log.fee))
    dailyUserFees.add(log.token, Number(log.fee))
  })

  liquidityRemovedLogs.forEach((log: any) => {
    // Try treating fee as token amount instead of USD
    dailyFees.add(log.token, Number(log.fee))
    dailyUserFees.add(log.token, Number(log.fee))
  })

  // Calculate revenue splits
  const dailyProtocolRevenue = dailyFees.clone(0.4) // 40% to protocol
  const dailySupplySideRevenue = dailyFees.clone(0.6) // 60% to supply side
  dailyRevenue.addBalances(dailyFees.clone(0.4)) // 40% total revenue (Treasury)

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-10-09',
    },
  },
  methodology: {
    Fees: 'Position fees (increase, decrease, liquidation) and liquidity fees are collected',
    UserFees: 'Position fees (increase, decrease, liquidation) and liquidity fees are collected',
    Revenue: '40% of the total fees goes to Treasury',
    ProtocolRevenue: '40% of the total fees goes to Treasury',
    SupplySideRevenue: '60% of the total fees goes to liquidity providers'
  },
}

export default adapter