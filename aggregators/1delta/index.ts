import { Interface, ZeroAddress } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { getTransactions, getTxReceipts } from "../../helpers/getTxReceipts";
import { CHAIN } from "../../helpers/chains";

const EVM_TRANSFER_EVENT_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]
const ERC20_INTERFACE = new Interface(EVM_TRANSFER_EVENT_ABI)

const META_AGGREGATOR_ADDRESS = {
  [CHAIN.MANTLE]: '0xC3c038FCD83E37A670D5461B87dCdc4Cc06cF3fC',
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
  },
}

export default adapter;