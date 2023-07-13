import { queryFlipside } from "../../helpers/flipsidecrypto";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";
import { ethers } from "ethers";
import { CHAIN } from "../../helpers/chains";

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 epoch,uint256 amount)';
const contract_interface = new ethers.utils.Interface([
  event_notify_reward
]);

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

interface IBribes {
  token: string;
  amount: number;
}


export const fees_bribes = async (fromBlock: number, toBlock: number, timestamp: number): Promise<number> => {
  try {
    const query = `
      SELECT
        to_address
      from
        optimism.core.fact_traces
      WHERE
      block_number > 17505890
      and from_address in (
          '0xfc1aa395ebd27664b11fc093c07e10ff00f0122c',
          '0x7955519e14fdf498e28831f4cc06af4b8e3086a8'
      )
      and type = 'CREATE'
    `
    const value: string[] = [...new Set((await queryFlipside(query)).flat())].filter(e => e);
    const query_split: string[] = [];
    for(let i = 0; i < value.length; i+=150) {
      const query_logs: string = `
      SELECT
        tx_hash as transactionHash,
        data,
        topics
      from
        optimism.core.fact_event_logs
      WHERE
        topics[0] = '0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b'
        and contract_address in (${value.slice(i, i + 150).map((a: string) => `'${a.toLowerCase()}'`).join(',')})
        and BLOCK_NUMBER > ${fromBlock} AND BLOCK_NUMBER < ${toBlock}
      `
      query_split.push(query_logs)
    }
    const logs_fees: ILog[] =  (await Promise.all(query_split.map((query_rx: string) =>  queryFlipside(query_rx)))).flat()
      .map(([transactionHash, data, topics]: [string, string, string[]]) => {
        return {
          transactionHash,
          data,
          topics
        } as ILog
      });

    const logs_bribes = logs_fees.map((e: ILog) => {
      const value = contract_interface.parseLog(e)
      return {
        token: value.args.reward,
        amount: Number(value.args.amount._hex)
      } as IBribes
    })
    const coins = [...new Set(logs_bribes.map((e: IBribes) => `${CHAIN.OPTIMISM}:${e.token.toLowerCase()}`))]
    const prices = await getPrices(coins, timestamp);
    const fees_bribes_usd = logs_bribes.map((e: IBribes) => {
      const price = prices[`${CHAIN.OPTIMISM}:${e.token.toLowerCase()}`].price
      const decimals = prices[`${CHAIN.OPTIMISM}:${e.token.toLowerCase()}`].decimals
      return (Number(e.amount) / 10 ** decimals) * price;
    }).reduce((a: number, b: number) => a+b, 0);
    return fees_bribes_usd;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
