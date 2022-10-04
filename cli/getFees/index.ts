import { getChainBlocks } from "@defillama/sdk/build/computeTVL/blocks";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { getAllChainsFromAdapters } from "../../utils/adapters";
import { BaseAdapter } from "../../adapters.type";
import { handleAdapterError } from "../../utils/adapters";
import allSettled from 'promise.allsettled'
import importAdapter from "./utils/importAdapter";
import { canGetBlock } from "../../volume/helper/getBlock"
import { fetchConfig } from "../../utils/config";
import { Chain } from "@defillama/sdk/build/general";

interface IHandlerEvent {
  protocolIndexes?: number[]
  timestamp?: number
  local?: boolean
  adapterFolder: string
}

export interface IRecordFeeData {
  [chain: string]: {
    [protocolVersion: string]: number | undefined,
  }
}

export const handler = async (event: IHandlerEvent) => {
  // Timestamp to query, defaults current timestamp
  const currentTimestamp = event.timestamp || Date.now() / 1000;
  const config = await fetchConfig();
  // Get clean day
  const fetchCurrentDayTimestamp = getTimestampAtStartOfDayUTC(currentTimestamp);

  // Get closest block to clean day. Only for EVM compatible ones.
  const allChains = getAllChainsFromAdapters(config).filter((chain: Chain) => chain.toString() !== "celo").filter(canGetBlock)
  const chainBlocks = await getChainBlocks(fetchCurrentDayTimestamp, allChains);

  async function runAdapter(feeAdapter: BaseAdapter, id: string, version?: string) {
    const chains = Object.keys(feeAdapter)

    return allSettled(chains.map((chain) => feeAdapter[chain].fetch(fetchCurrentDayTimestamp, chainBlocks).then(result => ({ chain, result })).catch((e) => handleAdapterError(e, {
      id,
      chain,
      version,
      timestamp: fetchCurrentDayTimestamp
    }))))
  }
  const feeResponses = await Promise.all([0].map(async () => {
    const adapterKey = event.adapterFolder
    const id = "No id assigned"
    console.log(`Grabbing fees for ${event.adapterFolder}`)

    try {
      // Import adapter
      const adapter = await importAdapter(event.adapterFolder);

      let rawDailyFees: IRecordFeeData[] = []
      let rawDailyRevenue: IRecordFeeData[] = []
      if ("fees" in adapter) {
        const runAdapterRes = await runAdapter(adapter.fees, id)
        // TODO: process rejected promises
        const fees = runAdapterRes.filter(rar => rar.status === 'fulfilled').map(r => r.status === "fulfilled" && r.value)
        for (const fee of fees) {
          if (fee && fee.result.dailyFees)
            rawDailyFees.push({
              [fee.chain]: {
                [adapterKey]: +fee.result.dailyFees
              },
            })
          if (fee && fee.result.dailyRevenue)
            rawDailyRevenue.push({
              [fee.chain]: {
                [adapterKey]: +fee.result.dailyRevenue
              },
            })
        }
      } else if ("breakdown" in adapter) {
        const dexFeeBreakDownAdapter = adapter.breakdown
        for (const [version, feeAdapterObj] of Object.entries(dexFeeBreakDownAdapter)) {
          const runAdapterRes = await runAdapter(feeAdapterObj, id)

          const fees = runAdapterRes.filter(rar => rar.status === 'fulfilled').map(r => r.status === "fulfilled" && r.value)

          for (const fee of fees) {
            if (fee && fee.result.dailyFees) {
              rawDailyFees.push({
                [fee.chain]: {
                  [version]: +fee.result.dailyFees
                },
              })
            }
            if (fee && fee.result.dailyRevenue) {
              rawDailyRevenue.push({
                [fee.chain]: {
                  [version]: +fee.result.dailyRevenue
                },
              })
            }
          }
        }
      } else {
        console.error("Invalid adapter")
        throw new Error("Invalid adapter")
      }

      const dailyFees = rawDailyFees.reduce((acc, current: IRecordFeeData) => {
        const chain = Object.keys(current)[0]
        acc[chain] = {
          ...acc[chain],
          ...current[chain]
        }
        return acc
      }, {} as IRecordFeeData)

      const dailyRevenue = rawDailyRevenue.reduce((acc, current: IRecordFeeData) => {
        const chain = Object.keys(current)[0]
        acc[chain] = {
          ...acc[chain],
          ...current[chain]
        }
        return acc
      }, {} as IRecordFeeData)
      console.log("Retrieved", "fees", fetchCurrentDayTimestamp, dailyFees)
      console.log("Retrieved", "revenue", fetchCurrentDayTimestamp, dailyRevenue)
    }
    catch (error) {
      const err = error as Error
      console.error(err)
      throw error
    }
  }))

  return
};

export default handler;
