import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock"
import { ethers } from 'ethers'
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices"
import { FetchResultFees, SimpleAdapter } from "../adapters/types"

const contract_address = '0xdb414fe5a6ae09f4b58df1e5615c38c4bee10a84'
const topic0 = '0x68f6fc9b4292a4019c38f766d951dada112bf514a9fa2245e113dd0d72f28615'
const topic1 = '0x26a1afef9fcca500b0a1e73a51830b5163e2d3d6027ffe6116c6dd3f95dfee69'
const event_trade = 'event TradePlaced(bytes poolId,address sender,uint256 amount,string prediction,uint256 newTotal,bytes indexed indexedPoolId,address indexed indexedSender,string avatarUrl,string countryCode,int64 roundStartTime,string whiteLabelId)'

const contract_interface = new ethers.Interface([
  event_trade
])

interface ILogs  {
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  transactionIndex: number;
  blockHash: string;
  logIndex: number;
  address: string;
}

const fetchFees = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const fromblock = (await getBlock(fromTimestamp, CHAIN.POLYGON, {}))
  const toblock = (await getBlock(toTimestamp, CHAIN.POLYGON, {}))
  const batchSize = 4500;
  const batches = Math.ceil((toblock - fromblock) / batchSize);

  let logs: ILogs[] = await Promise.all(
    Array.from({ length: batches }, (_, index) =>
      sdk.getEventLogs({
        toBlock: fromblock + (index + 1) * batchSize,
        fromBlock: fromblock + index * batchSize,
        target: contract_address,
        topics: [topic0, topic1],
        chain: CHAIN.POLYGON,
      })
    )
  ).then((responses) => responses.flatMap((response) => response as unknown as ILogs[]));

  const fees = logs.map((log: ILogs) => {
    const parsedLog = log.data.replace('0x', '')
    const amount = Number('0x' + parsedLog.slice(2 * 64, (2 * 64) + 64)) / 10 ** 18
    const fee =  amount * 0.05
    return fee;
  }).reduce((a: number, b: number) => a + b, 0);

  const feesInMartic = fees;

  const martic = `polygon:0x0000000000000000000000000000000000000000`
  const prices = await getPrices([martic], timestamp)
  const marticPrice = prices[martic].price;

  const feesInUsd = feesInMartic * marticPrice;

  return {
    timestamp,
    dailyFees: feesInUsd.toString(),
    dailyRevenue: feesInUsd.toString(),
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: async () => 1691625600,
    }
  }
}
export default adapters
