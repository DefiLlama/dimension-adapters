import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_geuge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'

const topic0_geuge_created = '0xef9f7d1ffff3b249c6b9bf2528499e935f7d96bb6d6ec4e7da504d1d3c6279e1';
const contract_interface = new ethers.Interface([
  event_notify_reward,
  event_geuge_created
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


export const getBribes = async (options: FetchOptions): Promise<any> => {
  try {
    const dailyBribesRevenue = options.createBalances();
    const fromBlock = await options.getFromBlock();
    const toBlock = await options.getToBlock();
    const voter = '0x30f827DECe6F25c74F37d0dD45bC245d893266e6';
    const logs_geuge_created: ethers.EventLog[] = (await sdk.api.util.getLogs({
      target: voter,
      fromBlock: 4265093, //Block number of the contract's creation
      toBlock: toBlock,
      topic: '',
      topics: [topic0_geuge_created],
      chain: CHAIN.SCROLL,
      keys: []
    })).output;
    const bribes_contract: string[] = logs_geuge_created.map((e: ethers.EventLog) => {
      const value = contract_interface.parseLog(e as any);
      return value?.args.bribeVotingReward;
    })

    const logs: ILog[] = (await Promise.all(bribes_contract.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: CHAIN.SCROLL,
      topics: ['0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b']
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output).flat();

    const logs_bribes = logs.map((e: ILog) => {
      const value = contract_interface.parseLog(e)
      return {
        token: value?.args.reward,
        amount: Number(value?.args.amount._hex)
      } as IBribes
    })
    logs_bribes.forEach((e: IBribes) => {
      dailyBribesRevenue.add(e.token, e.amount)
    });
    return {
      dailyBribesRevenue
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
}
