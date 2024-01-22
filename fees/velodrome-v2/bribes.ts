import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";

const event_notify_reward = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';
const event_geuge_created = 'event GaugeCreated(address indexed poolFactory,address indexed votingRewardsFactory,address indexed gaugeFactory,address pool,address bribeVotingReward,address feeVotingReward,address gauge,address creator)'

export const fees_bribes = async (fromBlock: number, toBlock: number, _: number): Promise<number> => {
  try {
    const api  = new sdk.ChainApi({ chain: CHAIN.OPTIMISM });
    const voter = '0x41c914ee0c7e1a5edcd0295623e6dc557b5abf3c';
    const logs_geuge_created= (await api.getLogs({
      target: voter,
      fromBlock: 105896851,
      toBlock: toBlock,
      chain: CHAIN.OPTIMISM,
      onlyArgs: true,
      eventAbi: event_geuge_created,
    }))
    const bribes_contract: string[] = logs_geuge_created.map((e: any) => e.bribeVotingReward.toLowerCase());

    const logs =await api.getLogs({
      targets: bribes_contract,
      toBlock: toBlock,
      fromBlock: fromBlock,
      chain: CHAIN.OPTIMISM,
      onlyArgs: true,
      eventAbi: event_notify_reward,
    })

    logs.forEach((e: any) => {
      api.add(e.reward, e.amount)
    })
    return api.getUSDValue();
  } catch (error) {
    console.error(error);
    throw error;
  }
}
