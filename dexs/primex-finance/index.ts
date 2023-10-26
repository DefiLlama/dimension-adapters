import * as sdk from "@defillama/sdk";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { getBlock } from "../../helpers/getBlock";
import { ethers } from "ethers";
import { getPrices } from "../../utils/prices";
import { config, abi, topics } from "./utils";


const fetch = (chain: string) => async (timestamp: number): Promise<FetchResultVolume> => {
  const { swapManager, positionManager, tokens } = config[chain];

  const logsConfig = [
    {
      target: swapManager,
      topics: [topics.swap]
    },
    {
      target: positionManager,
      topics: [topics.openPosition]
    },
    {
      target: positionManager,
      topics: [topics.closePosition]
    },
    {
      target: positionManager,
      topics: [topics.partiallyClosePosition]
    },
  ]

  const contractInterface = new ethers.utils.Interface(abi)

  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {
    const fromBlock = (await getBlock(fromTimestamp, chain, {}));
    const toBlock = (await getBlock(toTimestamp, chain, {}));
    
    const [swapLogs, openPositionLogs, closePositionLogs, partiallyClosePositionLogs] = (await Promise.all(logsConfig.map(({ target, topics }) => {
      return sdk.api.util.getLogs({
        target,
        topic: '',
        toBlock: toBlock,
        fromBlock: fromBlock,
        keys: [],
        chain,
        topics
      })
    }))).map(r => r.output as ethers.providers.Log[])

    const priceKeys = tokens.map((t) => `${chain}:${t.toLowerCase()}`)
    const prices = await getPrices(priceKeys, timestamp);

    const swapVolumeUSD: number = swapLogs
      .map((log: ethers.providers.Log) => {
        const parsedLog = contractInterface.parseLog(log);
        const amountSold = Number(parsedLog.args.amountSold._hex);
        const tokenA = parsedLog.args.tokenA;
        const priceA = prices[`${chain}:${tokenA.toLowerCase()}`]?.price || 0;
        const decimalsA = prices[`${chain}:${tokenA.toLowerCase()}`]?.decimals || 0;
        return (amountSold / 10 ** decimalsA) * priceA;
      })
      .reduce((a: number, b: number) => a + b, 0)
    
    const openPositionVolumeUSD: number = openPositionLogs
      .map((log: ethers.providers.Log) => {
        const parsedLog = contractInterface.parseLog(log);
        const soldAsset = parsedLog.args.position.soldAsset;
        const priceSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.price || 0;
        const decimalsSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.decimals || 0;
        const depositAmountInSoldAsset = Number(parsedLog.args.position.depositAmountInSoldAsset._hex) / 10 ** decimalsSoldAsset;
        const leverage = Number(parsedLog.args.leverage) / 10 ** 18
        return depositAmountInSoldAsset * leverage * priceSoldAsset;
      })
      .reduce((a: number, b: number) => a + b, 0)

    const closePositionVolumeUSD: number = closePositionLogs
      .map((log: ethers.providers.Log) => {
        const parsedLog = contractInterface.parseLog(log);
        const soldAsset = parsedLog.args.soldAsset;
        const priceSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.price || 0;
        const decimalsSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.decimals || 0;
        const amountOut = Number(parsedLog.args.amountOut._hex) / 10 ** decimalsSoldAsset;
        return amountOut * priceSoldAsset;
      })
      .reduce((a: number, b: number) => a + b, 0)
      
    const partiallyClosePositionVolumeUSD: number = partiallyClosePositionLogs
      .map((log: ethers.providers.Log) => {
        const parsedLog = contractInterface.parseLog(log);
        const soldAsset = parsedLog.args.soldAsset;
        const priceSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.price || 0;
        const decimalsSoldAsset = prices[`${chain}:${soldAsset.toLowerCase()}`]?.decimals || 0;
        const amountOut = Number(parsedLog.args.amountOut._hex) / 10 ** decimalsSoldAsset;
        return amountOut * priceSoldAsset;
      })
      .reduce((a: number, b: number) => a + b, 0)

    const dailyVolume = swapVolumeUSD + openPositionVolumeUSD + closePositionVolumeUSD + partiallyClosePositionVolumeUSD

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
