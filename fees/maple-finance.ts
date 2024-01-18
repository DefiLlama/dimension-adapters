import { time } from "console";
import { getBlock } from "../helpers/getBlock";
import { CHAIN } from "../helpers/chains";
import * as sdk from '@defillama/sdk';
import { SimpleAdapter } from "../adapters/types";
import { getPrices } from "../utils/prices";
import postgres from "postgres";

const eth_base = '0x373bdcf21f6a939713d5de94096ffdb24a406391';

const contract_loan_mangaer: string[] = [
  '0x91582bdfef0bf36fc326a4ab9b59aacd61c105ff',
  '0xeca9d2c5f81dd50dce7493104467dc33362a436f',
  '0xf4d4a5270aa834a2a77011526447fdf1e227018f',
  '0x1b61765e954113e6508c4f9db07675989f7f5874',
  '0xd05998a1940294e3e49f99dbb13fe20a3483f5ae',
  '0xd7217f29d51deffc6d5f95ff0a5200f3d34c0f66',
  '0x6b6491aaa92ce7e901330d8f91ec99c2a157ebd7',
  '0x74cb3c1938a15e532cc1b465e3b641c2c7e40c2b',
  '0x9b300a28d7dc7d422c7d1b9442db0b51a6346e00',
  '0x373bdcf21f6a939713d5de94096ffdb24a406391',
  '0xfdc7541201aa6831a64f96582111ced633fa5078'
]

const contract_open_term_loan: string[] = [
  '0x2638802a78d6a97d0041cc7b52fb9a80994424cd',
  '0x483082e93635ef280bc5e9f65575a7ff288aba33',
  '0x93b0f6f03cc6996120c19abff3e585fdb8d88648',
  '0xd205b3ed8408afca53315798b891f37bd4c5ce2a',
  '0xdc9b93a8a336fe5dc9db97616ea2118000d70fc0',
  '0xfab269cb4ab4d33a61e1648114f6147742f5eecc'
]

const funds_distribution_topic = '0x080babe757d4e5c7db3b7bd10606a7bf07a9857f660977ada6ca7a4d329376c8';
const claim_funds_topic = '0x5a3aaae9941b918d74569012f48c308c4044705e7ece73e7834f0f7ffd938b85';


interface ILogs {
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  transactionIndex: string;
  address: string;
  data: string;
  topics: string[];
  logIndex: string;
  removed: boolean;
}

const fetchFees = async (timestamp: number) => {
  const toTimestamp = timestamp;
  const fromTimestamp = timestamp - 86400;

  const sql = postgres(process.env.INDEXA_DB!);
  try {
      const now = new Date(timestamp * 1e3);
      const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24);
      const logsTranferERC20: any[] = (await sql`
        SELECT
          '0x' || encode(data, 'hex') AS value,
          '0x' || encode(contract_address, 'hex') AS contract_address
        FROM
          ethereum.event_logs
        WHERE
          block_number > 12428594
          AND topic_0 = '\\xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          AND topic_2 in ('\\x000000000000000000000000a9466eabd096449d650d5aeb0dd3da6f52fd0b19', '\\x000000000000000000000000d15b90ff80aa7e13fc69cd7ccd9fef654495e36c')
          AND block_time BETWEEN ${dayAgo.toISOString()} AND ${now.toISOString()};
      `)
      const toBlock = await getBlock(toTimestamp, CHAIN.ETHEREUM, {});
      const fromBlock = await getBlock(fromTimestamp, CHAIN.ETHEREUM, {});
      const logs_funds_distribution: ILogs[] = (await Promise.all(contract_loan_mangaer.map(async (contract) => sdk.getEventLogs({
          toBlock,
          fromBlock,
          target: contract,
          topics: [funds_distribution_topic],
          chain: CHAIN.ETHEREUM,
        })))).flat();

      const logs_claim_funds: ILogs[] = (await Promise.all(contract_open_term_loan.map(async (contract) => sdk.getEventLogs({
          toBlock,
          fromBlock,
          target: contract,
          topics: [claim_funds_topic],
          chain: CHAIN.ETHEREUM,
        })))).flat();

        const ethAddress = "ethereum:0x0000000000000000000000000000000000000000";
        const ethPrice = (await getPrices([ethAddress], timestamp))[ethAddress].price;

      const funds_fees = logs_funds_distribution.map((e: ILogs) => {
        const data = e.data.replace('0x', '');
        const fees = Number('0x' + data.slice(64, 64 + 64))
        const amount = e.address.toLowerCase() === eth_base.toLowerCase() ? (fees / 10 ** 18) * ethPrice : fees / 10 ** 6;
        return amount;
      }).reduce((a: number, b: number) => a + b, 0);

      const claim_fees = logs_claim_funds.map((e: ILogs) => {
        const data = e.data.replace('0x', '');
        const fees = Number('0x' + data.slice(64, 64 + 64))
        const amount = fees / 10 ** 6;
        return amount;
      }).reduce((a: number, b: number) => a + b, 0);
      const coins = [...new Set(logsTranferERC20.map((p: any) => `${CHAIN.ETHEREUM}:${p.contract_address}`))];
      const prices = await getPrices(coins, timestamp);
      const inflow = logsTranferERC20.reduce((a: number, b: any) => {
        const price = prices[`${CHAIN.ETHEREUM}:${b.contract_address}`]?.price || 0;
        const decimals = prices[`${CHAIN.ETHEREUM}:${b.contract_address}`]?.decimals || 0;
        if (price === 0 || decimals === 0) a;
        const value = Number(b.value) / 10 ** decimals;
        return a + (value * price);
      },0);

      await sql.end({ timeout: 3 })
      const dailyFees = funds_fees + claim_fees + inflow;
      const dailyRevenue = inflow;
      return {
        dailyFees: dailyFees.toString(),
        dailyRevenue: dailyRevenue.toString(),
        timestamp
      }
  } catch (error) {
    await sql.end({ timeout: 3 })
    console.error(error);
    throw error;
}
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: async () => 1672531200
    }
  }
}
export default adapters;
