import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";
import { getBlock } from "../helpers/getBlock";
import { Chain, getProvider } from "@defillama/sdk/build/general";
import postgres from 'postgres'
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
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp)

      const now = new Date(timestamp * 1e3)
      const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
      try {
        const fromBlock = (await getBlock(todaysTimestamp, chain, {}));
        const toBlock = (await getBlock(yesterdaysTimestamp, chain, {}));

        const logs: ITx[] = (await sdk.api.util.getLogs({
          target: address[chain],
          topic: '',
          fromBlock: fromBlock,
          toBlock: toBlock,
          topics: [topic0],
          keys: [],
          chain: chain
        })).output.map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx});

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
              sum(ethereum.transactions.gas_used*ethereum.transactions.gas_price)/10^18 as sum
              FROM ethereum.transactions
              INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
              WHERE
              block_number > 15987241
              and to_address = '\\x9008d19f58aabd9ed0d60971565aa8510560ab41'
              and success = true
              AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
          `
          allGasUsed = gasUsed[0].sum;

        } else {
          const provider = getProvider(chain);
          const txReceipt: number[] = chain === CHAIN.OPTIMISM ? [] : (await Promise.all(logs.map((e: ITx) => provider.getTransactionReceipt(e.transactionHash))))
            .map((e: any) => {
              const amount = (Number(e.gasUsed._hex) * Number(e.effectiveGasPrice?._hex || 0)) / 10 ** 18
              return amount
            })
            allGasUsed = txReceipt.reduce((a: number, b: number) => a + b, 0);
        }


        const tokenGasId = gasTokenId[chain];
        const tokens = [...new Set(rawLogsData.map((e: ISaleData) => `${chain}:${e.contract_address}`))]
        const splitIndex = Math.floor(tokens.length/2);
        const firstHalf = tokens.slice(0, splitIndex);
        const secondHalf = tokens.slice(splitIndex);
        const pricesfirstHalf = (await getPrices([...firstHalf], todaysTimestamp));
        const pricessecondHalf = (await getPrices([...secondHalf, tokenGasId], todaysTimestamp));
        const prices = Object.assign(pricesfirstHalf, pricessecondHalf);
        const gasPrice = chain === CHAIN.ETHEREUM ? prices[tokenGasId].price : 1;
        const consumeGas = allGasUsed * gasPrice;
        const amounts = rawLogsData.map((e: ISaleData) => {
          const price = prices[`${chain}:${e.contract_address}`]?.price || 0;
          const decimals = prices[`${chain}:${e.contract_address}`]?.decimals || 0;
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
    [CHAIN.XDAI]: {
      fetch: fetch(CHAIN.XDAI),
      start: async ()  => 1675382400,
      meta: {
        methodology
      }
    }
  }
}

export default adapter;
