import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import postgres from 'postgres'
import { request, gql } from "graphql-request";
import axios from "axios";
import { getBlock } from "../../helpers/getBlock";

const ARBITRUM_FEES_URL = "https://api.thegraph.com/subgraphs/name/dmihal/arbitrum-fees-collected";

interface IFee {
  totalFeesETHNitro: string;
  totalFeesETH: string;
}

interface IGraph {
  yesterday: IFee;
  today: IFee;
}

interface ITx {
  value: string;
}


const SEQUENCER_FEES = '0x18A08f3CA72DC4B5928c26648958655690b215ac'
const NETWORK_INFRA_FEES = '0x582A62dB643BCFF3B0Bf1DA45f812e3a354d7518'
const CONGESTION_FEES = '0xb04D2C62c0Cd8cec5691Cefd2E7CF041EBD26382'
const SEQUENCER_FEES_NITRO = '0xa4b1e63cb4901e327597bc35d36fe8a23e4c253f'
const NETWORK_INFRA_FEES_NITRO = '0xD345e41aE2cb00311956aA7109fC801Ae8c81a52'
const CONGESTION_FEES_NITRO = '0xa4B00000000000000000000000000000000000F6'
const NEW_1 = '0xc1b634853cb333d3ad8663715b08f41a3aec47cc'

const getWithdrawalTxs = async (address: string, startblock: number, endblock: number): Promise<number> => {
  const url = `https://api.arbiscan.io/api?module=account&action=txlist&address=${address}&startblock=${startblock}&endblock=${endblock}`;
  const data: ITx[] = await axios.get(url).then((e: any) => e.data.result).catch((err: any) => {
    console.error(`error get tx list: ${err}`);
    return [];
  });
  return Array.isArray(data) ? data.reduce((acc, { value }) => acc + Number(value) / 1e18, 0) : 0;
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: async (timestamp: number) => {
        const sql = postgres(process.env.INDEXA_DB!);
        const now = new Date(timestamp * 1e3)
        const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)

        try {
          const fromTimestamp = timestamp - 60 * 60 * 24
          const toTimestamp = timestamp
          const startDateId = Math.floor(toTimestamp / 86400);
          const endDateId = startDateId + 1;

          const startblock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
          const endblock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
          const query = gql`
            query txFees($startDateId: String!, $endDateId: String!){
              yesterday: fee(id: $startDateId) {
                totalFeesETH
              }
              today: fee(id: $endDateId) {
                totalFeesETH
              }
          }`;
          const res: IGraph  = await request(ARBITRUM_FEES_URL, query, {startDateId: startDateId.toString(), endDateId: endDateId.toString()});

          const withdrawalTxs = await Promise.all([
            getWithdrawalTxs(SEQUENCER_FEES, startblock, endblock),
            getWithdrawalTxs(NETWORK_INFRA_FEES, startblock, endblock),
            getWithdrawalTxs(CONGESTION_FEES, startblock, endblock),
            getWithdrawalTxs(SEQUENCER_FEES_NITRO, startblock, endblock),
            getWithdrawalTxs(NETWORK_INFRA_FEES_NITRO, startblock, endblock),
            getWithdrawalTxs(CONGESTION_FEES_NITRO, startblock, endblock),
            getWithdrawalTxs(NEW_1, startblock, endblock),
          ]);

          const totalWithdrawn = withdrawalTxs.reduce((a: number, b: number) => a + b, 0);

          const fees = (Number(res.today.totalFeesETH) - Number(res.yesterday.totalFeesETH)) + totalWithdrawn;

          const sequencerGas = await sql`
            SELECT
              sum(ethereum.transactions.gas_used*ethereum.transactions.gas_price)/10^18 as sum
            FROM ethereum.transactions
            INNER JOIN ethereum.blocks ON ethereum.transactions.block_number = ethereum.blocks.number
            WHERE ( to_address = '\\x1c479675ad559dc151f6ec7ed3fbf8cee79582b6'::bytea -- Current inbox
            OR to_address = '\\x4c6f947Ae67F572afa4ae0730947DE7C874F95Ef'::bytea -- Arbitrum: Sequencer Inbox
            OR to_address = '\\x51de512aa5dfb02143a91c6f772261623ae64564'::bytea -- Arbitrum: Validator1
            ) AND (block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()});
          `
          const seqGas: number = sequencerGas[0].sum

          const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
          const ethPrice = (await getPrices([ethAddress], toTimestamp))[ethAddress].price;
          await sql.end({ timeout: 3 })
          return {
            timestamp: toTimestamp,
            dailyFees: (fees * ethPrice).toString(),
            dailyRevenue: ((fees - seqGas) * ethPrice).toString(),
          };
        } catch (error) {
          await sql.end({ timeout: 3 })
          throw error
        }

      },
      start: async () => 1628553600
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
