import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain, } from "@defillama/sdk/build/general";
import postgres from 'postgres'
import getTxReceipts from "../helpers/getTxReceipts";
const topic0 = '0xa07a543ab8a018198e99ca0184c93fe9050a79400a0a723441f84de1d972cc17';

type TAddress = {
  [l: string | Chain]: string;
}
const address: TAddress = {
  [CHAIN.ETHEREUM]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
  [CHAIN.XDAI]: '0x9008d19f58aabd9ed0d60971565aa8510560ab41'
}

interface ITx {
  data: string;
  transactionHash: string;
}

interface ISaleData {
  contract_address: string;
  amount: number;
}
type IGasTokenId = {
  [l: string | Chain]: string;
}
const gasTokenId: IGasTokenId = {
  [CHAIN.ETHEREUM]: "ethereum:0x0000000000000000000000000000000000000000",
  [CHAIN.XDAI]: "xdai:0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
}


const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
      const sql = postgres(process.env.INDEXA_DB!);
      const fromTimestamp = timestamp - 60 * 60 * 24
      const toTimestamp = timestamp

      const now = new Date(timestamp * 1e3)
      const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
      try {
        const fromBlock = (await getBlock(fromTimestamp, chain, {}));
        const toBlock = (await getBlock(toTimestamp, chain, {}));

        const logs: ITx[] = (await sdk.getEventLogs({
          target: address[chain],
          fromBlock: fromBlock,
          toBlock: toBlock,
          topics: [topic0],
          chain: chain
        })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

        const rawLogsData: ISaleData[] = logs.map((tx: ITx) => {
          const amount = Number('0x' + tx.data.slice(256, 320));
          const address = tx.data.slice(0, 64);
          const contract_address = '0x' + address.slice(24, address.length);
          return {
            amount: amount,
            contract_address: contract_address,
          } as ISaleData
        });
        let allGasUsed = 0;
        if (chain === CHAIN.ETHEREUM) {
          const gasUsed = await sql`
            SELECT
              COUNT(ethereum.event_logs.transaction_hash) as _count,
              ethereum.transactions.gas_used * ethereum.transactions.gas_price / 10 ^ 18 AS sum
            FROM
              ethereum.event_logs
              INNER JOIN ethereum.blocks ON ethereum.event_logs.block_number = ethereum.blocks.number
              INNER JOIN ethereum.transactions on ethereum.event_logs.transaction_hash = ethereum.transactions.hash
            WHERE
              ethereum.event_logs.contract_address = '\\x9008d19f58aabd9ed0d60971565aa8510560ab41'
              AND ethereum.event_logs.topic_0 = '\\xed99827efb37016f2275f98c4bcf71c7551c75d59e9b450f79fa32e60be672c2'
              AND success = TRUE
              AND ethereum.event_logs.block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()}
              GROUP by sum
          `
          allGasUsed = gasUsed.map((e: any) => {
            return Number(e.sum) / Number(e._count)
          }).reduce((a: number, b: number) =>a + b,0)
        } else {
          const txReceipt: number[] = chain === CHAIN.OPTIMISM ? [] : (await getTxReceipts(chain, logs.map((e: ITx) => e.transactionHash)))
            .map((e: any) => {
              const amount = (Number(e.gasUsed) * Number(e.effectiveGasPrice || 0)) / 10 ** 18
              return amount
            })
            allGasUsed = txReceipt.reduce((a: number, b: number) => a + b, 0);
        }

        const tokenGasId = gasTokenId[chain];
        const tokens = [...new Set(rawLogsData.map((e: ISaleData) => `${chain}:${e.contract_address.toLowerCase()}`))]
        const splitIndex = Math.floor(tokens.length/2);
        const firstHalf = tokens.slice(0, splitIndex);
        const secondHalf = tokens.slice(splitIndex);
        const pricesfirstHalf = (await getPrices([...firstHalf], toTimestamp));
        const pricessecondHalf = (await getPrices([...secondHalf, tokenGasId], toTimestamp));
        const prices = Object.assign(pricesfirstHalf, pricessecondHalf);
        const gasPrice = chain === CHAIN.ETHEREUM ? prices[tokenGasId].price : 1;
        const consumeGas = allGasUsed * gasPrice;
        const amounts = rawLogsData.map((e: ISaleData) => {
          const price = prices[`${chain}:${e.contract_address.toLowerCase()}`]?.price || 0;
          const decimals = prices[`${chain}:${e.contract_address.toLowerCase()}`]?.decimals || 0;
          return (e.amount / 10 ** decimals) * price;
        });
        const dailyFees = amounts.reduce((a: number, b: number) => a+b, 0);
        const dailyRevenue = dailyFees - consumeGas;
        await sql.end({ timeout: 3 })
        return {
          dailyUserFees: dailyFees.toString(),
          dailyFees: dailyFees.toString(),
          dailyRevenue: dailyRevenue.toString(),
          timestamp
        }
    } catch(error) {
      await sql.end({ timeout: 3 })
      throw error
    }
  }
}

const methodology = {
  UserFees: "Trading fees",
  Fees: "Trading fees",
  Revenue: "Trading fees - transation fees",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: async ()  => 1675382400,
        meta: {
          methodology
        }
    },
    // [CHAIN.XDAI]: {
    //   fetch: fetch(CHAIN.XDAI),
    //   start: async ()  => 1675382400,
    //   meta: {
    //     methodology
    //   }
    // }
  }
}

export default adapter;
