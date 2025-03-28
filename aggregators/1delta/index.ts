import { ethers } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FUEL_SUBGRAPH_URL = 'https://endpoint.sentio.xyz/1delta/fuel-subgraph/volume'
const FUEL_SUBGRAPH_API_KEY = 'mHWELZ01Oo3BRfGb0WrhFvryge78baQVT'

const createFuelVolumeFetcher = () => {
  return async ({ startTimestamp, endTimestamp }: FetchOptions) => {
    return fetch(FUEL_SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'api-key': FUEL_SUBGRAPH_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "startTimestamp": startTimestamp,
        "endTimestamp": endTimestamp
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
        return response.json();
      })
      .then((result) => {
        const rows = result.syncSqlResponse.result?.rows || []

        const dailyVolume = rows.reduce((acc: number, row) => acc + Number(row.volumeUsd), 0)
  
        return {
          dailyVolume,
        }
      })
  }
}

const transferEventSig = ethers.id("Transfer(address,address,uint256)");

const META_AGGREGATOR_ADDRESS = {
  [CHAIN.MANTLE]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.OPTIMISM]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.POLYGON]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.LINEA]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.BSC]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.AVAX]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.TAIKO]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.BASE]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.ARBITRUM]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.BLAST]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.METIS]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.XDAI]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.MODE]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.HEMI]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.SCROLL]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.CORE]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.SONIC]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400',
  [CHAIN.FANTOM]: '0xDDDD191F453A387E3D2bB594E657A6D8c8c6D400'
}

const createEVMVolumeFetcher = (chain: string) => {
  return async ({ getFromBlock, getToBlock, createBalances, api }: FetchOptions) => {
    const dailyVolume = createBalances()

    const toTopic = ethers.zeroPadValue(META_AGGREGATOR_ADDRESS[chain], 32)

    console.log("fromBlock", await getFromBlock())
    console.log("toBlock", await getToBlock())
    console.log("chain", chain)

    const transferLogs = (await api.provider.getLogs({
      fromBlock: await getFromBlock(),
      toBlock: await getToBlock(),
      topics: [transferEventSig, null, toTopic],
    }))

    const erc20Transfers = transferLogs.map((log) => {
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["uint256"],
          log.data
        )
    
        return {
          asset: log.address,
          value: decoded[0].toString(),
        }
      } catch (error) {
        console.error("Error decoding log:", error)
        return null
      }
    }).filter(t => !!t)

    dailyVolume.add(erc20Transfers.map(t => t.asset), erc20Transfers.map(t => t.value))

    return { dailyVolume }
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      Object.keys(META_AGGREGATOR_ADDRESS).map(chain => [
        chain, 
        { fetch: createEVMVolumeFetcher(chain), start: '2025-03-01' }
      ])
    ),
    [CHAIN.FUEL]: { fetch: createFuelVolumeFetcher(), start: '2025-01-20' }
  },
}

export default adapter;