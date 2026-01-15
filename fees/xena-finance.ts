import BigNumber from 'bignumber.js'
import { Adapter, FetchOptions } from "../adapters/types"
import { CHAIN } from '../helpers/chains'
import { getBlock } from '../helpers/getBlock'
import { ethers } from 'ethers'

// Xena Finance Protocol contract on Base
const PROTOCOL_CONTRACT = '0x22787c26bb0ab0d331eb840ff010855a70a0dca6'

// Event signatures for fee collection
const EVENT_TOPICS = {
  IncreasePosition: '0x8f1a004341b7c2e1e0799b80c6b849e04431c20757ba9b8c9064d5132405465d',
  DecreasePosition: '0x8b8cf2b995650a0e5239d131bc9ace3606d59971f1c0370675babdbc1fc48e5f',
  LiquidatePosition: '0x136cbd19b29e7d7cbbb67178581f238ef5029382a513cd55f0096e974441a6fb',
  Swap: '0xb24b74123b08b3e5d2af6b47e948b1c8eed24d9f717f27a4b2fc3aa82699696e',
  LiquidityAdded: '0x43c967b388d3a4ccad3f7ab80167852e322e5a3fde9893f530252281b2ae8b70',
  LiquidityRemoved: '0xd765e08eef31c0983ecca03ecd166297ac485ecd5dd69e291c848f0a020333c1',
}

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const [startBlock, endBlock] = await Promise.all([
    getBlock(timestamp - 86400, options.chain, {}),
    getBlock(timestamp, options.chain, {}),
  ])

  const abiCoder = new ethers.AbiCoder()

  // Get logs for all fee-generating events
  const eventTopics = Object.values(EVENT_TOPICS)
  const logsPromises = eventTopics.map(topic =>
    options.getLogs({
      target: PROTOCOL_CONTRACT,
      topics: [topic],
      fromBlock: startBlock,
      toBlock: endBlock,
    })
  )
  const logsArrays = await Promise.all(logsPromises)
  const logs = logsArrays.flat()

  let totalFees = new BigNumber(0)
  
  logs.forEach((log) => {
    try {
      const topic = log.topics[0]
      let feeValue: BigNumber
      
      if (topic === EVENT_TOPICS.IncreasePosition) {
        // IncreasePosition(bytes32 key, address account, address collateralToken, address indexToken, 
        //                  uint256 collateralValue, uint256 sizeChanged, uint8 side, uint256 indexPrice, uint256 feeValue)
        const decoded = abiCoder.decode(
          ['address', 'address', 'address', 'uint256', 'uint256', 'uint8', 'uint256', 'uint256'],
          log.data
        )
        feeValue = new BigNumber(decoded[7].toString()) // feeValue is index 7
        
      } else if (topic === EVENT_TOPICS.DecreasePosition) {
        // DecreasePosition(bytes32 key, address account, address collateralToken, address indexToken,
        //                  uint256 collateralChanged, uint256 sizeChanged, uint8 side, uint256 indexPrice, int256 pnl, uint256 feeValue)
        const decoded = abiCoder.decode(
          ['address', 'address', 'address', 'uint256', 'uint256', 'uint8', 'uint256', 'int256', 'uint256'],
          log.data
        )
        feeValue = new BigNumber(decoded[8].toString()) // feeValue is index 8
        
      } else if (topic === EVENT_TOPICS.LiquidatePosition) {
        // LiquidatePosition(bytes32 key, address account, address collateralToken, address indexToken, uint8 side,
        //                   uint256 size, uint256 collateralValue, uint256 reserveAmount, uint256 indexPrice, int256 pnl, uint256 feeValue)
        const decoded = abiCoder.decode(
          ['address', 'address', 'address', 'uint8', 'uint256', 'uint256', 'uint256', 'uint256', 'int256', 'uint256'],
          log.data
        )
        feeValue = new BigNumber(decoded[9].toString()) // feeValue is index 9
        
      } else if (topic === EVENT_TOPICS.LiquidityAdded) {
        // LiquidityAdded(address tranche, address sender, address token, uint256 amount, uint256 lpAmount, uint256 fee)
        const decoded = abiCoder.decode(
          ['address', 'uint256', 'uint256', 'uint256'],
          log.data
        )
        feeValue = new BigNumber(decoded[3].toString()) // fee is index 3
        
      } else if (topic === EVENT_TOPICS.LiquidityRemoved) {
        // LiquidityRemoved(address tranche, address sender, address token, uint256 lpAmount, uint256 amountOut, uint256 fee)
        const decoded = abiCoder.decode(
          ['address', 'uint256', 'uint256', 'uint256'],
          log.data
        )
        feeValue = new BigNumber(decoded[3].toString()) // fee is index 3
        
      } else if (topic === EVENT_TOPICS.Swap) {
        // Swap(address sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 priceIn, uint256 priceOut)
        const decoded = abiCoder.decode(
          ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'],
          log.data
        )
        feeValue = new BigNumber(decoded[4].toString()) // fee is index 4
        
      } else {
        // For any unknown events, try to extract the last uint256 as feeValue
        const dataWithoutSelector = log.data.slice(2)
        const lastParam = '0x' + dataWithoutSelector.slice(-64)
        feeValue = new BigNumber(lastParam)
      }
      
      if (feeValue.gt(0)) {
        totalFees = totalFees.plus(feeValue)
      }
      
    } catch (error) {
      console.error('Error parsing log:', error)
    }
  })

  // Convert from wei (30 decimals based on original code)
  const dailyFee = totalFees.dividedBy(1e30)

  return {
    dailyFees: dailyFee.toString(),
    dailyUserFees: dailyFee.toString(),
    dailyRevenue: dailyFee.times(50).dividedBy(100).toString(),
    dailyProtocolRevenue: dailyFee.times(40).dividedBy(100).toString(),
    dailySupplySideRevenue: dailyFee.times(50).dividedBy(100).toString(),
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2023-10-09',
    },
  },
  methodology: {
    Fees: 'All mint, burn, margin, liquidation and swap fees are collected',
    UserFees: 'All mint, burn, margin, liquidation and swap fees are collected',
    Revenue: 'Revenue is 50% of the total fees, which goes to Treasury and is reserved for development',
    ProtocolRevenue: '40% of the total fees goes to Treasury'
  },
}

export default adapter