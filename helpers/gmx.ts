import { BaseAdapter, FetchOptions, FetchResultV2, FetchV2, IJSON, SimpleAdapter } from "../adapters/types"


const getGmxV1LogAdapter: any = ({
    vault,
    ProtocolRevenue,
    SupplySideRevenue,
    HoldersRevenue,
}: { vault: string, Revenue?: number, ProtocolRevenue?: number, SupplySideRevenue?: number, HoldersRevenue?: number }) => {
  const fetch: FetchV2 = async (fetchOptions: FetchOptions) => {
    const { createBalances, getLogs } = fetchOptions
    const dailyFees = createBalances()
    const dailyUserFees = createBalances()

    // Increase position
    const increasePositionLogs = await getLogs({
      target: vault,
      eventAbi: 'event IncreasePosition(bytes32 key,address account,address collateralToken,address indexToken,uint256 collateralDelta,uint256 sizeDelta,bool isLong,uint256 price,uint256 fee)',
    })
    // Decrease position
    const decreasePositionLogs = await getLogs({
      target: vault,
      eventAbi: 'event DecreasePosition(bytes32 key,address account,address collateralToken,address indexToken,uint256 collateralDelta,uint256 sizeDelta,bool isLong,uint256 price,uint256 fee)',
    })
    // Swap fees
    const swapLogs = await getLogs({
      target: vault,
      eventAbi: 'event Swap(address account,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,uint256 amountOutAfterFees,uint256 feeBasisPoints)',
    })
    // Mint fees
    const logsBuy = await getLogs({
      target: vault,
      eventAbi: 'event BuyUSDG(address account,address token,uint256 tokenAmount,uint256 usdgAmount,uint256 feeBasisPoints)',
    })

    const logsSell = await getLogs({
      target: vault,
      eventAbi: 'event SellUSDG(address account,address token,uint256 usdgAmount,uint256 tokenAmount,uint256 feeBasisPoints)',
    })

    // liquidation fees
    const liquidationLogs = await getLogs({
      target: vault,
      eventAbi: 'event CollectMarginFees(address token,uint256 feeUsd,uint256 feeTokens)',
    })

    // Calculate fees
    increasePositionLogs.forEach((log: any) => {
      dailyFees.addUSDValue(Number(log.fee)/1e30)
    })
    decreasePositionLogs.forEach((log: any) => {
      dailyFees.addUSDValue(Number(log.fee)/1e30)
    })

    // Calculate swap fees
    swapLogs.forEach((log: any) => {
      dailyFees.add(log.tokenOut, Number(log.amountOut)* Number(log.feeBasisPoints)*1e-4)
      dailyUserFees.add(log.tokenOut, Number(log.amountOut)* Number(log.feeBasisPoints)*1e-4)
    })

    // Calculate liquidation fees
    liquidationLogs.forEach((log: any) => {
      dailyFees.addUSDValue(Number(log.feeUsd)/1e30)
      dailyUserFees.addUSDValue(Number(log.feeUsd)/1e30)
    })

    // Calculate sell fees
    logsSell.forEach((log: any) => {
      dailyFees.addUSDValue((Number(log.usdgAmount)/1e18) * Number(log.feeBasisPoints) * 1e-4)
    })
    
    // Calculate mint fees
    logsBuy.forEach((log: any) => {
      dailyFees.addUSDValue((Number(log.usdgAmount)/1e18) * Number(log.feeBasisPoints) * 1e-4)
    })

    const result = { dailyFees, dailyUserFees } as FetchResultV2
    
    // Validate total revenue
    const totalRevenue = Number(ProtocolRevenue || 0) + Number(SupplySideRevenue || 0)  + Number(HoldersRevenue || 0)
    if (totalRevenue > 100) {
      throw new Error("Total revenue must be 100%")
    }
    
    if (ProtocolRevenue || HoldersRevenue) result.dailyRevenue = dailyFees.clone(Number(ProtocolRevenue || 0) + Number(HoldersRevenue || 0)/100)
    if (ProtocolRevenue) result.ProtocolRevenue = dailyFees.clone(ProtocolRevenue/100)
    if (SupplySideRevenue) result.dailySupplySideRevenue = dailyFees.clone(SupplySideRevenue/100)
    if (HoldersRevenue) result.dailyHoldersRevenue = dailyFees.clone(HoldersRevenue/100)

    return result
  }
  return fetch  
}   



export const gmxV1Exports = (config: IJSON<{ 
    vault: string,
    start: string,
    ProtocolRevenue?: number,
    SupplySideRevenue?: number,
    HoldersRevenue?: number,
    methodology?: any 
} >) => {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getGmxV1LogAdapter(chainConfig),
      start: chainConfig.start,
      meta: { methodology: chainConfig.methodology },
    }
  })
  return { adapter: exportObject, version: 2 } as SimpleAdapter
}
