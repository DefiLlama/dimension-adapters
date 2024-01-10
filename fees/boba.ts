import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from 'postgres'
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { getBalance } from "@defillama/sdk/build/eth";

const withdrawal_address = '0x4200000000000000000000000000000000000010';
const topic0 = '0x73d170910aba9e6d50b102db522b1dbcd796216f5128b445aa2135272886497e';
const topic1 = '0x0000000000000000000000000000000000000000000000000000000000000000';

interface ITx {
  data: string;
  transactionHash: string;
}

async function getFees(todaysTimestamp: number, yesterdaysTimestamp: number, _: ChainBlocks) {
  const todaysBlock = (await getBlock(todaysTimestamp, "boba", {}));
  const endTodayBlock = (await getBlock(yesterdaysTimestamp, "boba", {}));
  const logs: ITx[] = (await sdk.getEventLogs({
    target: withdrawal_address,
    fromBlock: todaysBlock,
    toBlock: endTodayBlock,
    topics: [topic0, topic1],
    chain: 'boba'
  })).map((e: any) => { return { data: e.data.replace('0x', ''), transactionHash: e.transactionHash } as ITx });

  const amounts: number[] = logs.map((tx: ITx) => {
    const amount = Number('0x' + tx.data.slice(64, 128)) / 10 ** 18;
    return amount;
  });
  const dailyFee = amounts.reduce((a: number, b: number) => a + b, 0);

  const feeWallet = '0x4200000000000000000000000000000000000011';
  const { output: startBalance } = await getBalance({
    target: feeWallet,
    block: todaysBlock,
    chain: "boba"
  });
  const { output: endBalance } = await getBalance({
    target: feeWallet,
    block: endTodayBlock,
    chain: "boba"
  });
  return ((Number(endBalance) - Number(startBalance)) / 10 ** 18) + dailyFee
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BOBA]: {
      fetch: async (timestamp: number, chainBlocks: ChainBlocks) => {
        const sql = postgres(process.env.INDEXA_DB!);
        try {
          const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
          const endToDayTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);
          const startDay = new Date(todaysTimestamp * 1e3);
          const endDay = new Date(endToDayTimestamp * 1e3);
          const totalFees = await getFees(todaysTimestamp, endToDayTimestamp, chainBlocks)
          const sequencerGas = await sql`
              SELECT
                sum(ethereum.transactions.gas_used * ethereum.transactions.gas_price)/10^18 as sum
              FROM ethereum.transactions
                INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
              WHERE ( to_address = '\\xfbd2541e316948b259264c02f370ed088e04c3db'::bytea -- Canonical Transaction Chain
                OR to_address = '\\xde7355c971a5b733fe2133753abd7e5441d441ec'::bytea -- State Commitment Chain
              ) AND (block_time BETWEEN ${startDay} AND ${endDay});
            `

          const seqGas = sequencerGas[0].sum;
          const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
          const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
          await sql.end({ timeout: 3 });
          const dailyRevenue = (totalFees - seqGas) * (ethPrice);
          return {
            timestamp,
            dailyFees: (totalFees * ethPrice).toString(),
            dailyRevenue: dailyRevenue.toString(),
          };
        } catch (error) {
          await sql.end({ timeout: 3 });
          throw error
        }
      },
      start: async () => 1664582400
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
