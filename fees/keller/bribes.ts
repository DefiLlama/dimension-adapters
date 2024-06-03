import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";


export const getBribes = async (options: FetchOptions): Promise<any> => {
  try{
    const voter = '0x30f827DECe6F25c74F37d0dD45bC245d893266e6';
    const event_notify_reward = 'event NotifyReward(address indexed from, address indexed reward, uint epoch, uint amount)';
    const event_gauge_created = 'event GaugeCreated(address indexed gauge, address creator, address internal_bribe, address indexed external_bribe, address indexed pool)'
    const dailyBribesRevenue = options.createBalances();
    const logs_gauge_created = (await options.api.getLogs({
      target: voter,
      fromBlock: 4265908,
      toBlock: await options.getToBlock(),
      eventAbi: event_gauge_created,
      chain: CHAIN.SCROLL
    }));

    const gauges_contracts : string[] = logs_gauge_created.map((e: any) => {
      return e.args.gauge.toLowerCase();
    });
    const wrapped_external_bribes = (await options.api.multiCall({
      target: voter,
      abi: 'function gaugesInfo(address) view returns (address,address,address,address,address,uint256,uint256)',
      chain: CHAIN.SCROLL,
      calls: gauges_contracts
    })).map((e: any) => e[4]);
    const logs = await options.api.getLogs({
      targets: wrapped_external_bribes,
      eventAbi: event_notify_reward,
      toBlock: await options.getToBlock(),
      fromBlock: await options.getFromBlock(),
      chain: CHAIN.SCROLL
    })
    logs.map((e: any) => {
      dailyBribesRevenue.add(e.args.reward, e.args.amount)
    })
    return {
      dailyBribesRevenue,
    };
  } catch (error) {
    console.error(error);
    throw error;
  }

}
