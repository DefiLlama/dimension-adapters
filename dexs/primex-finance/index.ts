import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { config, } from "./utils";

const abi = {
  "SpotSwap": "event SpotSwap(address indexed trader, address indexed receiver, address tokenA, address tokenB, uint256 amountSold, uint256 amountBought)",
  "OpenPosition": "event OpenPosition(uint256 indexed positionId, address indexed trader, address indexed openedBy, (uint256 id, uint256 scaledDebtAmount, address bucket, address soldAsset, uint256 depositAmountInSoldAsset, address positionAsset, uint256 positionAmount, address trader, uint256 openBorrowIndex, uint256 createdAt, uint256 updatedConditionsAt, bytes extraParams) position, address feeToken, uint256 protocolFee, uint256 entryPrice, uint256 leverage, (uint256 managerType, bytes params)[] closeConditions)",
  "ClosePosition": "event ClosePosition(uint256 indexed positionId, address indexed trader, address indexed closedBy, address bucketAddress, address soldAsset, address positionAsset, uint256 decreasePositionAmount, int256 profit, uint256 positionDebt, uint256 amountOut, uint8 reason)",
  "PartialClosePosition": "event PartialClosePosition(uint256 indexed positionId, address indexed trader, address bucketAddress, address soldAsset, address positionAsset, uint256 decreasePositionAmount, uint256 depositedAmount, uint256 scaledDebtAmount, int256 profit, uint256 positionDebt, uint256 amountOut)"
}

const fetch = (chain: string) => async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultVolume> => {
  const { swapManager, positionManager, batchManager } = config[chain];
  const dailyVolume = createBalances()

  const logsConfig = [
    { targets: swapManager, eventAbi: abi.SpotSwap },
    { targets: positionManager, eventAbi: abi.OpenPosition },
    { targets: positionManager, eventAbi: abi.ClosePosition },
    { targets: positionManager, eventAbi: abi.PartialClosePosition },
    { targets: batchManager, eventAbi: abi.ClosePosition },
  ]

  const [swapLogs, openPositionLogs, closePositionLogs, partiallyClosePositionLogs, closePositionBatchLogs] = await Promise.all(logsConfig.map(async (config) => getLogs(config)))

  swapLogs.forEach((e: any) => dailyVolume.add(e.tokenA, e.amountSold))
  openPositionLogs.forEach((e: any) => dailyVolume.add(e.position.soldAsset, e.position.amountSold * e.leverage))
  closePositionLogs.forEach((e: any) => dailyVolume.add(e.soldAsset, e.amountOut))
  partiallyClosePositionLogs.forEach((e: any) => dailyVolume.add(e.soldAsset, e.amountOut))
  closePositionBatchLogs.forEach((e: any) => dailyVolume.add(e.soldAsset, e.amountOut))

  return { dailyVolume: dailyVolume, timestamp, }


}
const adapters: SimpleAdapter = {
  adapter: Object.keys(config).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain),
        start: config[chain].start,
      }
    }
  }, {})
}
export default adapters;
