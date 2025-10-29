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

        const dailyVolume = rows.reduce((acc: number, row: any) => acc + Number(row.volumeUsd), 0)

        return {
          dailyVolume,
        }
      })
  }
}

const SUPPORTED_CHAIN_MAPPING: { [chain: Chain]: { chainId: number, start: string } } = {
  [CHAIN.MANTLE]: { chainId: 5000, start: '2025-03-01' },
  [CHAIN.OPTIMISM]: { chainId: 10, start: '2025-03-01' },
  [CHAIN.POLYGON]: { chainId: 137, start: '2025-03-01' },
  [CHAIN.LINEA]: { chainId: 59144, start: '2025-03-01' },
  [CHAIN.BSC]: { chainId: 56, start: '2025-03-01' },
  [CHAIN.AVAX]: { chainId: 43114, start: '2025-03-01' },
  [CHAIN.TAIKO]: { chainId: 167000, start: '2025-03-01' },
  [CHAIN.BASE]: { chainId: 8453, start: '2025-03-01' },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: '2025-03-01' },
  [CHAIN.BLAST]: { chainId: 81457, start: '2025-03-01' },
  [CHAIN.METIS]: { chainId: 1088, start: '2025-03-01' },
  [CHAIN.XDAI]: { chainId: 100, start: '2025-03-01' },
  [CHAIN.MODE]: { chainId: 34443, start: '2025-03-01' },
  [CHAIN.HEMI]: { chainId: 43111, start: '2025-03-01' },
  [CHAIN.SCROLL]: { chainId: 534352, start: '2025-03-01' },
  [CHAIN.CORE]: { chainId: 1116, start: '2025-03-01' },
  [CHAIN.SONIC]: { chainId: 146, start: '2025-03-01' },
  [CHAIN.FANTOM]: { chainId: 250, start: '2025-03-01' },
  [CHAIN.KLAYTN]: { chainId: 8217, start: '2025-10-21' }, // Kaia
  [CHAIN.SONEIUM]:  { chainId: 1868, start: '2025-10-21' },
  [CHAIN.HYPERLIQUID]:  { chainId: 999, start: '2025-10-21' },
  [CHAIN.BERACHAIN]:  { chainId: 80094, start: '2025-10-21' },
  [CHAIN.CRONOS]:  { chainId: 25, start: '2025-10-21' },
  [CHAIN.XDC]:  { chainId: 50, start: '2025-10-21' },
  [CHAIN.UNICHAIN]:  { chainId: 130, start: '2025-10-21' },
  [CHAIN.KATANA]:  { chainId: 747474, start: '2025-10-21' },
  [CHAIN.ETHEREUM]:  { chainId: 1, start: '2025-10-21' },
  [CHAIN.TELOS]:  { chainId: 40, start: '2025-10-21' },
  [CHAIN.MORPH]:  { chainId: 2818, start: '2025-10-21' },
  [CHAIN.MANTA]:  { chainId: 169, start: '2025-10-21' },
  [CHAIN.PLASMA]:  { chainId: 9745, start: '2025-10-21' },
  [CHAIN.MOONBEAM]:  { chainId: 1284, start: '2025-10-21' },
}

const getEVMVolumeAPI = (chainId: number, fromBlock: number, toBlock: number) =>
  `https://volume.1delta.io/volume?chainId=${chainId}&fromBlock=${fromBlock}&toBlock=${toBlock}`

const createEVMVolumeFetcher = (chainId: number) => {
  return async ({ getFromBlock, getToBlock, api, createBalances }: FetchOptions) => {
    const dailyVolume = createBalances()

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
      Object.entries(SUPPORTED_CHAIN_MAPPING).map(([chain, { chainId, start }]) => [
        chain,
        { fetch: createEVMVolumeFetcher(chainId), start }
      ])
    ),
    [CHAIN.FUEL]: { fetch: createFuelVolumeFetcher(), start: '2025-01-20' }
  },
}

export default adapter;