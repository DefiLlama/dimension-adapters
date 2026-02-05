import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock"
import * as sdk from "@defillama/sdk";
import { FetchResultFees, SimpleAdapter } from "../adapters/types"

const contract_address = '0xFAc9D58Cc823f75E0B275208FE69077e7a4CacaB'
const event_trade = 'event TradePlaced(bytes poolId,address sender,uint256 amount,string prediction,uint256 newTotal,bytes indexed indexedPoolId,address indexed indexedSender,string avatarUrl,string countryCode,int64 roundStartTime,string whiteLabelId)'

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromBlock = (await getBlock(fromTimestamp, CHAIN.POLYGON, {}))
  const toBlock = (await getBlock(toTimestamp, CHAIN.POLYGON, {}))
  const api = new sdk.ChainApi({ chain: CHAIN.POLYGON, timestamp, })

  let logs = await api.getLogs({
    toBlock,
    fromBlock,
    target: contract_address,
    eventAbi: event_trade,
    onlyArgs: true,
    chain: CHAIN.POLYGON,
  })

  const matic = `0x0000000000000000000000000000000000000000`
  logs.forEach((log: any) => {
    api.add(matic, Number(log.amount) * 0.05)
  })

  const feesInUsd = await api.getUSDString()

  return {
    timestamp,
    dailyFees: feesInUsd,
    dailyRevenue: feesInUsd,
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2023-08-10',
    }
  },
  methodology: {
    Fees: "Trading fees paid by users.",
    Revenue: "All fees are revenue.",
  }
}
export default adapters
