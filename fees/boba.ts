import { Adapter, ChainBlocks, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getPrices } from "../utils/prices";
import postgres from 'postgres'
import { getBlock } from "../helpers/getBlock";
import request, { gql } from "graphql-request";
import BigNumber from "bignumber.js";
import { getBalance } from "@defillama/sdk/build/eth";

const sql = postgres(process.env.INDEXER_DB!);

async function getFees(todaysTimestamp: number, yesterdaysTimestamp: number, _: ChainBlocks){
  const todaysBlock = (await getBlock(todaysTimestamp, "boba", {}));
  const endTodayBlock = (await getBlock(yesterdaysTimestamp, "boba", {}));
  const graphQuery = gql
      `query txFees {
          today: withdrawns(id: "1", block: { number: ${todaysBlock} }) {
              amount
          }
          endToday: withdrawns(id: "1", block: { number: ${endTodayBlock} }) {
              amount
          }
    }`;

  const graphRes = await request("https://api.thegraph.com/subgraphs/name/0xngmi/boba-fee-withdrawn", graphQuery);

  const dailyFee = new BigNumber(graphRes["endToday"][0].amount).minus(graphRes["today"][0].amount);

  const feeWallet = '0x4200000000000000000000000000000000000011';
  const startBalance = await getBalance({
      target: feeWallet,
      block: todaysBlock,
      chain: "boba"
  });
  const endBalance = await getBalance({
      target: feeWallet,
      block: endTodayBlock,
      chain: "boba"
  });

  return (new BigNumber(endBalance.output).plus(dailyFee).minus(startBalance.output)).div(1e18);
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.BOBA]: {
        fetch:  async (timestamp: number, chainBlocks: ChainBlocks) => {
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
            ) AND (timestamp BETWEEN ${startDay} AND ${endDay});
          `

          const seqGas = sequencerGas[0].sum;
          const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
          const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;
          await sql.end({ timeout: 5 });
          return {
              timestamp,
              dailyFees: (totalFees.times(ethPrice)).toString(),
              dailyRevenue: ((totalFees.minus(seqGas)).times(ethPrice)).toString(),
          };
        },
        start: async () => 1609459200
    },
},
  protocolType: ProtocolType.CHAIN
}

export default adapter;
