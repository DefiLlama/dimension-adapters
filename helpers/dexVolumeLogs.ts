
import * as sdk from "@defillama/sdk";

const swapEvent = "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)"
// const swapTopic = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"

type getDexVolumeParams = { chain: string, fromTimestamp: number, toTimestamp?: number, factory?: string, timestamp: number, pools?: string[] }
type getDexVolumeFeeParamsV3 = { chain: string, fromTimestamp: number, toTimestamp?: number, factory?: string, factoryFromBlock?: number, timestamp: number, pools?: string[], isFee?: boolean }

type getDexVolumeExportsParams = { chain: string, factory?: string, pools?: string[] }
type getDexVolumeExportsParamsV3 = { chain: string, factory?: string, pools?: string[], factoryFromBlock?: number, }

export async function getDexVolume({ chain, fromTimestamp, toTimestamp, factory, timestamp, pools }: getDexVolumeParams) {
  try {
    if (!toTimestamp) toTimestamp = timestamp
    const api = new sdk.ChainApi({ chain, timestamp: toTimestamp });
    const fromBlock = (await sdk.blocks.getBlock(chain, fromTimestamp)).block;
    const toBlock = (await sdk.blocks.getBlock(chain, toTimestamp)).block;
    // await api.getBlock();
    if (!pools) pools = await api.fetchList({ lengthAbi: 'allPairsLength', itemAbi: 'allPairs', target: factory! })

    const token0s = await api.multiCall({ abi: 'address:token0', calls: pools! })
    const token1s = await api.multiCall({ abi: 'address:token1', calls: pools! })

    const logs = await sdk.getEventLogs({
      targets: pools,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain,
      eventAbi: swapEvent,
      flatten: false,
      onlyArgs: true,
    });
    logs.forEach((log: any[], index: number) => {
      const token0 = token0s[index]
      const token1 = token1s[index]
      if (!log.length) return
      log.forEach((i: any) => {
        // api.add(token0, i.amount0In) // we should count only one side of the swap
        api.add(token0, i.amount0Out)
        // api.add(token1, i.amount1In)
        api.add(token1, i.amount1Out)
      })
    })
    const { usdTvl } = await api.getUSDJSONs()
    return {
      timestamp,
      dailyVolume: Number(usdTvl).toFixed(0),
    }
  } catch (e) {
    console.error(e)
    throw e
  }
}

export function getDexVolumeExports(options: getDexVolumeExportsParams) {
  return async (timestamp: number) => {
    const params = { ...options, timestamp, fromTimestamp: timestamp - 60 * 60 * 24, toTimestamp: timestamp }
    return getDexVolume(params)
  }
}

type getDexFeesParams = { chain: string, fromTimestamp?: number, toTimestamp?: number, factory?: string, timestamp: number, pools?: string[], lengthAbi?: string, itemAbi?: string, fromBlock?: number, toBlock?: number, }
type getDexFeesExportParams = { chain: string, factory?: string, pools?: string[], lengthAbi?: string, itemAbi?: string, }

const feesEvent = "event Fees(address indexed sender, uint256 amount0, uint256 amount1)"
// const feesTopic = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602'
export async function getDexFees({ chain, fromTimestamp, toTimestamp, factory, timestamp, pools, lengthAbi = 'allPairsLength', itemAbi = 'allPairs', fromBlock, toBlock, }: getDexFeesParams) {
  try {
    if (!toTimestamp) toTimestamp = timestamp
    const api = new sdk.ChainApi({ chain, timestamp: toTimestamp });
    if (!fromBlock)
      fromBlock = (await sdk.blocks.getBlock(chain, fromTimestamp)).block;
    if (!toBlock)
      toBlock = (await sdk.blocks.getBlock(chain, toTimestamp)).block;
    // await api.getBlock();
    if (!pools) pools = await api.fetchList({ lengthAbi, itemAbi, target: factory! })

    const token0s = await api.multiCall({ abi: 'address:token0', calls: pools! })
    const token1s = await api.multiCall({ abi: 'address:token1', calls: pools! })

    const logs = await sdk.getEventLogs({
      targets: pools,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain,
      eventAbi: feesEvent,
      flatten: false,
      onlyArgs: true,
    });
    logs.forEach((log: any[], index: number) => {
      const token0 = token0s[index]
      const token1 = token1s[index]
      if (!log.length) return
      log.forEach((i: any) => {
        api.add(token0, i.amount0)
        api.add(token1, i.amount1)
      })
    })
    const { usdTvl } = await api.getUSDJSONs()
    const value = Number(usdTvl).toFixed(0)
    return {
      timestamp,
      dailyFees: value,
      dailyRevenue: value,
      dailyHoldersRevenue: value,
    }
  } catch (e) {
    console.error(e)
    throw e
  }
}

export function getDexFeesExports(options: getDexFeesExportParams) {
  return async (timestamp: number) => {
    const params = { ...options, timestamp, fromTimestamp: timestamp - 60 * 60 * 24, toTimestamp: timestamp }
    return getDexFees(params)
  }
}

const v3PoolCreated = 'event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)';
const v3SwapEvent = 'event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)'

export async function getDexVolumeFeeV3({ chain, fromTimestamp, toTimestamp, factory, timestamp, pools, factoryFromBlock, isFee = false, }: getDexVolumeFeeParamsV3) {
  if (!toTimestamp) toTimestamp = timestamp
  const api = new sdk.ChainApi({ chain, timestamp: toTimestamp });
  const fromBlock = (await sdk.blocks.getBlock(chain, fromTimestamp)).block;
  const toBlock = (await sdk.blocks.getBlock(chain, toTimestamp)).block;
  // await api.getBlock();
  if (!pools) {
    const logs = await sdk.getEventLogs({
      target: factory,
      toBlock: toBlock,
      fromBlock: factoryFromBlock,
      chain,
      eventAbi: v3PoolCreated,
      onlyArgs: true,
    });
    pools = logs.map((log: any) => log.pool)
  }

  // const token0s = await api.multiCall({ abi: 'address:token0', calls: pools! })
  let fees = [] as any
  if (isFee) 
    fees = await api.multiCall({ abi: 'uint24:fee', calls: pools! })
  const token1s = await api.multiCall({ abi: 'address:token1', calls: pools! })

  const logs = await sdk.getEventLogs({
    targets: pools,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain,
    eventAbi: v3SwapEvent,
    flatten: false,
    onlyArgs: true,
  });
  logs.forEach((log: any[], index: number) => {
    const token1 = token1s[index]
    if (!log.length) return
    let fee = 1
    if (isFee) {
      fee = fees[index] ?? 0
      if (fee === 0) return;
      fee /= 1e6
    }
    log.forEach((i: any) => {
      let amount = Number(i.amount1)
      if (+amount < 0) amount *= -1
      api.add(token1, amount * fee)
    })
  })
  return {
    timestamp,
    dailyVolume: await api.getUSDString(),
  }
}

export function getDexVolumeExportsV3(options: getDexVolumeExportsParamsV3) {
  return async (timestamp: number) => {
    const params = { ...options, timestamp, fromTimestamp: timestamp - 60 * 60 * 24, toTimestamp: timestamp }
    return getDexVolumeFeeV3(params)
  }
}


export function getDexFeesExportsV3(options: getDexVolumeExportsParamsV3) {
  return async (timestamp: number) => {
    const params = { ...options, timestamp, fromTimestamp: timestamp - 60 * 60 * 24, toTimestamp: timestamp, isFee: true, }
    return getDexVolumeFeeV3(params)
  }
}
