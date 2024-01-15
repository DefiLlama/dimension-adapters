
import * as sdk from "@defillama/sdk";

const swapEvent = "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)"
// const swapTopic = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822"

export async function getDexVolume({ chain, fromTimestamp, toTimestamp, factory, timestamp, pools }: { chain: string, fromTimestamp: number, toTimestamp?: number, factory?: string, timestamp: number, pools?: string[] }) {
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
        api.add(token0, i.amount0In)
        api.add(token0, i.amount0Out)
        api.add(token1, i.amount1In)
        api.add(token1, i.amount1Out)
      })
    })
    const { rawTokenBalances, usdTokenBalances, usdTvl } = await api.getUSDJSONs()
    return {
      timestamp,
      dailyVolume: usdTvl.toString(),
      extraInfo: {
        dailyVolumeRawTokens: rawTokenBalances,
        dailyVolumeTokens: usdTokenBalances,
      }
    }
  } catch (e) {
    console.error(e)
    throw e
  }
}