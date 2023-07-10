import { queryFlipside } from "../../helpers/flipsidecrypto";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../../utils/prices";
import { ethers } from "ethers";

const topic0_notify_reward = '0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b';
const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 epoch,uint256 amount)';
const contract_interface = new ethers.utils.Interface([
  event_notify_reward
]);

export const fees_bribes = async (fromBlock: number, toBlock: number) => {
  try {
    const query = `
      SELECT input_data from optimism.core.fact_transactions
      WHERE
      block_number > 10078668
      and to_address in ('0xc5be2c918eb04b091962fdf095a217a55cfa42c5')
      and ORIGIN_FUNCTION_SIGNATURE = '0xa5f4301e'
      and status = 'SUCCESS'
    `
    const value: string[] = [...new Set((await queryFlipside(query)).flat().map((e: string) => e.replace('0xa5f4301e000000000000000000000000', '0x')))];
    // console.log(value)
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
    const logs_fees: any[] =  (await Promise.all(query_split.map((query_rx: string) =>  queryFlipside(query_rx)))).flat();
    console.log(logs_fees)
    return 0;
  } catch (error) {

  }
}
