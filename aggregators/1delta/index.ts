import { Chain } from "../../adapters/types";
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

const SUPPORTED_CHAIN_MAPPING: { [chain: Chain]: number } = {
  [CHAIN.MANTLE]: 5000,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.POLYGON]: 137,
  [CHAIN.LINEA]: 59144,
  [CHAIN.BSC]: 56,
  [CHAIN.AVAX]: 43114,
  [CHAIN.TAIKO]: 167000,
  [CHAIN.BASE]: 8453,
  // [CHAIN.ARBITRUM]: 42161,
  [CHAIN.BLAST]: 81457,
  [CHAIN.METIS]: 1088,
  [CHAIN.XDAI]: 100,
  [CHAIN.MODE]: 34443,
  [CHAIN.HEMI]: 43111,
  [CHAIN.SCROLL]: 534352,
  [CHAIN.CORE]: 1116,
  [CHAIN.SONIC]: 146,
  [CHAIN.FANTOM]: 250
}

const getEVMVolumeAPI = (chainId: number, fromBlock: number, toBlock: number) =>
  `https://volume.1delta.io/volume?chainId=${chainId}&fromBlock=${fromBlock}&toBlock=${toBlock}`

const createEVMVolumeFetcher = (chain: string) => {
  return async ({ getFromBlock, getToBlock, api, createBalances }: FetchOptions) => {
    const dailyVolume = createBalances()

    const chainId: number | undefined = SUPPORTED_CHAIN_MAPPING[chain] ?? api.chainId
    if (!chainId) throw new Error(`Chain ${chain} is not supported`)

    const fromBlock = await getFromBlock()
    const toBlock = await getToBlock()

    const response = await fetch(getEVMVolumeAPI(chainId, fromBlock, toBlock), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok || response.status !== 200) {
      // throw new Error(`HTTP error! Status: ${response.status}`)
      return {}
    }

    const volumeByAsset = await response.json()

    const asssets = Object.keys(volumeByAsset)
    const volumes = Object.values(volumeByAsset)

    dailyVolume.add(asssets, volumes)

    return {
      dailyVolume,
    }
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      Object.keys(SUPPORTED_CHAIN_MAPPING).map(chain => [
        chain,
        { fetch: createEVMVolumeFetcher(chain), start: '2025-03-01' }
      ])
    ),
    [CHAIN.FUEL]: { fetch: createFuelVolumeFetcher(), start: '2025-01-20' }
  },
}

export default adapter;