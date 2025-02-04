import { Interface, ZeroAddress } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { getTransactions, getTxReceipts } from "../../helpers/getTxReceipts";
import { CHAIN } from "../../helpers/chains";

const EVM_TRANSFER_EVENT_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]
const ERC20_INTERFACE = new Interface(EVM_TRANSFER_EVENT_ABI)

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
}

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

const createEVMVolumeFetcher = (chain: string) => {
  return async ({ getFromBlock, getToBlock, createBalances, api }: FetchOptions) => {
    const dailyVolume = createBalances()

    const emptyLogs = (await api.provider.getLogs({
      address: META_AGGREGATOR_ADDRESS[chain],
      fromBlock: await getFromBlock(),
      toBlock: await getToBlock(),
    })).filter(
      (log) => log.topics.length === 0 && log.data === '0x'
    )

    const receipts = await getTxReceipts(chain, emptyLogs.map(log => log.transactionHash), { cacheKey: '1delta' })
    const logs = receipts.flatMap(receipt => receipt?.logs)

    const txns = await getTransactions(chain, emptyLogs.map(log => log.transactionHash), { cacheKey: '1delta' })

    const transferLogs: any[] = [];

    logs.forEach((log) => {
      try {
        if (!log) return
        const event = ERC20_INTERFACE.parseLog(log)

        if (!event || !event.args.value || event.name !== 'Transfer') return
        transferLogs.push({ asset: log.address.toLowerCase(), ...event })
      } catch (e) {}
    })

    const erc20Transfers = transferLogs.filter(
      (t) => t.name === "Transfer" && t.args.to?.toLowerCase() === META_AGGREGATOR_ADDRESS[chain].toLowerCase()
    ).map(t => ({ asset: t.asset, value: t.args.value }))

    const nativeTransfers = txns.flatMap((tx) => {
      if (tx && tx.to?.toLowerCase() === META_AGGREGATOR_ADDRESS[chain].toLowerCase() && tx.value > 0) {
        return { asset: ZeroAddress, value: tx.value.toString() }
      }
      return []
    })

    dailyVolume.add(erc20Transfers.map(t => t.asset), erc20Transfers.map(t => t.value))
    dailyVolume.addGasToken(nativeTransfers.map(t => t.value))

    return { dailyVolume }
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    ...Object.fromEntries(
      Object.keys(META_AGGREGATOR_ADDRESS).map(chain => [
        chain, 
        { fetch: createEVMVolumeFetcher(chain), start: '2025-01-25' }
      ])
    ),
    [CHAIN.FUEL]: { fetch: createFuelVolumeFetcher(), start: '2025-01-20' }
  },
}

export default adapter;