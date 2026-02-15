import { BaseAdapter, FetchOptions, FetchResultV2, FetchV2, IJSON, SimpleAdapter } from "../adapters/types"
import { METRIC } from "./metrics"


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
    const dailyVolume = createBalances()
    const dailyRevenue = createBalances()

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

    const liquidationPositionLogs = await getLogs({
      target: vault,
      eventAbi: 'event LiquidatePosition(bytes32 key,address account,address collateralToken,address indexToken,bool isLong,uint256 size,uint256 collateral,uint256 reserveAmount,int256 realisedPnl,uint256 markPrice)',
    })

    // Calculate fees
    increasePositionLogs.forEach((log: any) => {
      dailyFees.addUSDValue(Number(log.fee)/1e30, METRIC.MARGIN_FEES)
      dailyVolume.addUSDValue(Number(log.sizeDelta)/1e30)
    })
    decreasePositionLogs.forEach((log: any) => {
      dailyFees.addUSDValue(Number(log.fee)/1e30, METRIC.MARGIN_FEES)
      dailyVolume.addUSDValue(Number(log.sizeDelta)/1e30)
    })

    // Calculate swap fees
    swapLogs.forEach((log: any) => {
      dailyFees.add(log.tokenOut, Number(log.amountOut)* Number(log.feeBasisPoints)*1e-4, METRIC.SWAP_FEES)
      dailyUserFees.add(log.tokenOut, Number(log.amountOut)* Number(log.feeBasisPoints)*1e-4, METRIC.SWAP_FEES)
      dailyVolume.add(log.tokenIn, Number(log.amountIn))
    })

    // Calculate liquidation fees
    liquidationLogs.forEach((log: any) => {
      dailyFees.addUSDValue(Number(log.feeUsd)/1e30, METRIC.LIQUIDATION_FEES)
      dailyUserFees.addUSDValue(Number(log.feeUsd)/1e30, METRIC.LIQUIDATION_FEES)
    })

    // Calculate sell fees
    logsSell.forEach((log: any) => {
      dailyFees.addUSDValue((Number(log.usdgAmount)/1e18) * Number(log.feeBasisPoints) * 1e-4, METRIC.MINT_REDEEM_FEES)
    })

    // Calculate mint fees
    logsBuy.forEach((log: any) => {
      dailyFees.addUSDValue((Number(log.usdgAmount)/1e18) * Number(log.feeBasisPoints) * 1e-4, METRIC.MINT_REDEEM_FEES)
    })

    liquidationPositionLogs.forEach((log: any) => {
      dailyVolume.addUSDValue(Number(log.size)/1e30)
    })

    const result = { dailyFees, dailyUserFees, dailyVolume, dailyRevenue, } as FetchResultV2
    
    // Validate total revenue
    const totalRevenue = Number(ProtocolRevenue || 0) + Number(SupplySideRevenue || 0)  + Number(HoldersRevenue || 0)
    if (totalRevenue > 100) {
      throw new Error("Total revenue must be 100%")
    }
    
    if (ProtocolRevenue || HoldersRevenue) result.dailyRevenue = dailyFees.clone((Number(ProtocolRevenue || 0) + Number(HoldersRevenue || 0))/100, METRIC.PROTOCOL_FEES)
    if (ProtocolRevenue) {
      result.dailyProtocolRevenue = dailyFees.clone(ProtocolRevenue/100, METRIC.PROTOCOL_FEES)
      dailyRevenue.addBalances(result.dailyProtocolRevenue)
    }
    if (SupplySideRevenue) result.dailySupplySideRevenue = dailyFees.clone(SupplySideRevenue/100, METRIC.LP_FEES)
    if (HoldersRevenue) {
      result.dailyHoldersRevenue = dailyFees.clone(HoldersRevenue/100, 'Token Holder Fees')
      dailyRevenue.addBalances(result.dailyHoldersRevenue)
    }


    return result
  }
  return fetch  
}   



const breakdownMethodology = {
  Fees: {
    [METRIC.MARGIN_FEES]: 'Fees paid by traders when opening or closing leveraged positions',
    [METRIC.SWAP_FEES]: 'Fees paid by users when swapping tokens through the vault',
    [METRIC.MINT_REDEEM_FEES]: 'Fees paid when minting or redeeming USDG stablecoin',
    [METRIC.LIQUIDATION_FEES]: 'Fees collected from liquidations of under-collateralized positions',
  },
  UserFees: {
    [METRIC.SWAP_FEES]: 'Swap fees paid by users',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation fees paid by liquidated positions',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Portion of all fees retained by the protocol treasury',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: 'Portion of all fees retained by the protocol treasury',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Portion of all fees distributed to liquidity providers (GLP holders)',
  },
  HoldersRevenue: {
    'Token Holder Fees': 'Portion of all fees distributed to governance token holders',
  },
}

export const gmxV1Exports = (config: IJSON<{
    vault: string,
    start: string,
    ProtocolRevenue?: number,
    SupplySideRevenue?: number,
    HoldersRevenue?: number,
    methodology?: any,
} >) => {
  const exportObject: BaseAdapter = {}
  const methodology =  Object.values(config).find((c) => c.methodology)?.methodology
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getGmxV1LogAdapter(chainConfig),
      start: chainConfig.start,
    }
  })
  return { adapter: exportObject, version: 2, methodology, breakdownMethodology } as SimpleAdapter
}
