import * as sdk from "@defillama/sdk";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { getBlock } from "../../helpers/getBlock";
import { ethers } from "ethers";
import { getPrices } from "../../utils/prices";
import { config, abi, topics } from "./utils";


const fetch = (chain: string) => async (timestamp: number): Promise<FetchResultVolume> => {
  const { swapManager, positionManager, batchManager } = config[chain];

  const logsConfig = [
    {
      targets: swapManager,
      topics: [topics.swap]
    },
    {
      targets: positionManager,
      topics: [topics.openPosition]
    },
    {
      targets: positionManager,
      topics: [topics.closePosition]
    },
    {
      targets: positionManager,
      topics: [topics.partiallyClosePosition]
    },
    {
      targets: batchManager,
      topics: [topics.closePosition]
    },
  ]

  const contractInterface = new ethers.Interface(abi)

  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    
    const [swapLogs, openPositionLogs, closePositionLogs, partiallyClosePositionLogs, closePositionBatchLogs] = (await Promise.all(logsConfig.map(async ({ targets, topics }) => {
      return (await Promise.all(targets.map(target => {
        return sdk.getEventLogs({
          target,
          toBlock: toBlock,
          fromBlock: fromBlock,
          chain,
          topics
        })
      }))).map(r => r as ethers.Log[]).flat()
    })))

    const swapTokens: string[] = swapLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const tokenA = parsedLog!.args.tokenA.toLowerCase();
        return tokenA
      });

    const openPositionTokens: string[] = openPositionLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const soldAsset = parsedLog!.args.position.soldAsset.toLowerCase();
        return soldAsset
      });

    const closePositionTokens: string[] = closePositionLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const soldAsset = parsedLog!.args.soldAsset.toLowerCase();
        return soldAsset
      })
      
    const partiallyClosePositionTokens: string[] = partiallyClosePositionLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const soldAsset = parsedLog!.args.soldAsset.toLowerCase();
        return soldAsset
      })

    const closePositionBatchTokens: string[] = closePositionBatchLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const soldAsset = parsedLog!.args.soldAsset.toLowerCase();
        return soldAsset
      })

    const uniqueTokens = Array.from(new Set(swapTokens.concat(openPositionTokens, closePositionTokens, partiallyClosePositionTokens, closePositionBatchTokens)))

    const priceKeys = uniqueTokens.map((t) => `${chain}:${t}`)
    const prices = await getPrices(priceKeys, timestamp);

    const swapVolumeUSD: number = swapLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const amountSold = Number(parsedLog!.args.amountSold);
        const tokenA = parsedLog!.args.tokenA;
        const priceA = prices[`${chain}:${tokenA.toLowerCase()}`]?.price || 0;
        const decimalsA = prices[`${chain}:${tokenA.toLowerCase()}`]?.decimals || 0;
        return (amountSold / 10 ** decimalsA) * priceA;
      })
      .reduce((a: number, b: number) => a + b, 0)
    
    const openPositionVolumeUSD: number = openPositionLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const soldAsset = parsedLog!.args.position.soldAsset;
        const priceSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.price || 0;
        const decimalsSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.decimals || 0;
        const depositAmountInSoldAsset = Number(parsedLog!.args.position.depositAmountInSoldAsset) / 10 ** decimalsSoldAsset;
        const leverage = Number(parsedLog!.args.leverage) / 10 ** 18
        return depositAmountInSoldAsset * leverage * priceSoldAsset;
      })
      .reduce((a: number, b: number) => a + b, 0)

    const closePositionVolumeUSD: number = closePositionLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const soldAsset = parsedLog!.args.soldAsset;
        const priceSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.price || 0;
        const decimalsSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.decimals || 0;
        const amountOut = Number(parsedLog!.args.amountOut) / 10 ** decimalsSoldAsset;
        return amountOut * priceSoldAsset;
      })
      .reduce((a: number, b: number) => a + b, 0)
      
    const partiallyClosePositionVolumeUSD: number = partiallyClosePositionLogs
      .map((log: ethers.Log) => {
        const parsedLog = contractInterface.parseLog(log as any);
        const soldAsset = parsedLog!.args.soldAsset;
        const priceSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.price || 0;
        const decimalsSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.decimals || 0;
        const amountOut = Number(parsedLog!.args.amountOut) / 10 ** decimalsSoldAsset;
        return amountOut * priceSoldAsset;
      })
      .reduce((a: number, b: number) => a + b, 0)

    const closePositionBatchVolumeUSD: number = closePositionBatchLogs
        .map((log: ethers.Log) => {
          const parsedLog = contractInterface.parseLog(log as any);
          const soldAsset = parsedLog!.args.soldAsset;
          const priceSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.price || 0;
          const decimalsSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.decimals || 0;
          const amountOut = Number(parsedLog!.args.amountOut) / 10 ** decimalsSoldAsset;
          return amountOut * priceSoldAsset;
        })
        .reduce((a: number, b: number) => a + b, 0)

    const dailyVolume = swapVolumeUSD + openPositionVolumeUSD + closePositionVolumeUSD + partiallyClosePositionVolumeUSD + closePositionBatchVolumeUSD

    return {
      dailyVolume: `${dailyVolume}`,
      timestamp
    }
  } catch(e) {
    console.error(e)
    throw e;
  }

}
const adapters: SimpleAdapter = {
  adapter: Object.keys(config).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(chain),
        start: async () => config[chain].start,
      }
    }
  }, {})
}
export default adapters;
