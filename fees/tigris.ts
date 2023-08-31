import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";

type PerpContract = {
  [s: Chain | string]: string[];
}
const perp_contract: PerpContract = {
  [CHAIN.POLYGON]: [
    '0x67d11ff59a7797bd5e3d58510d7c086ea0732436',
    '0x486bafa7d418896c67dccab0612589f208aa3249',
    '0xa80aa05437112ba844628ee73acfe94c31f8fe28',
    '0x591a4e2adba199bdb08f28d00a1756f4c245bdf7',
    '0xb7260e90181cb2df86e61d614c44b30721cc6531',
    '0xb173fde7b7d419514d8b3f8e854e978ea93b1c50',
    '0x28c5d4416f6cf0fc5f557067b54bd67a43fcc98f',
    '0xcde587e333327fbf887548b3eaf111fb50d38388',
    '0x38889a19893ed9129a2f017a3f60ecbed6dbe5aa',
    '0x2381e421ee2a89ea627f971e8fdfa4ffa81c2cdd',
    '0x311921e7d079ffc65f5d458f972c377559d70bbd',
    '0x1e17288b6bec5c432d0ab7bb16fe37c0d094a67d',
  ],
  [CHAIN.ARBITRUM]: [
    '0x6c5da3f6a1f1b41fee2aa4a86b935272663b4957',
    '0x0cc23bf1761c85e010d257f02fd638d4e4221579',
    '0xdde031307c185ab3fa1b51874f4ee57841b20292',
    '0xcf6d276dd9f4203ae56ba62ded3f5d1120243eaa',
    '0xe17a2829f0c23c02e662c616081dcad18dcbb7e4',
    '0x2b6026d7b69f0fa4e703d965bb0fef0fa838fead',
    '0x40cde4820ec2270511d36db418a14a4aff16276b',
    '0x62f0a3f138e762d08eff0651857ef3e51cee6742',
  ]
}

type OptionContract = {
  [s: Chain | string]: string;
}

const option_contract: OptionContract = {
  [CHAIN.POLYGON]: '0x28969ded75cf3bce9f2b6bd49ac92d8ba8dfc3d1',
  [CHAIN.ARBITRUM]: '0xc6d1ba6363ffe4fdda9ffbea8d91974de9775331'
}

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const topic0_fees_distibution = '0xb89c76a3dead86dde74a2a7f80bbe6ee35632e71fa4f60fb76177cce95a3cb72';
const topic0_option_fees_distibution = '0x5146a00d88bc8d5b51da0a31b8b0163c52d08795010875de4612d9ca5b7ac2e7'

const event_fees_distibution = 'event FeesDistributed(address tigAsset,uint256 daoFees,uint256 burnFees,uint256 refFees,uint256 botFees,address referrer)';
const event_option_fees_distibution = 'event OptionsFeesDistributed(address tigAsset,uint256 daoFees,uint256 refFees,uint256 botFees,address referrer)';

interface IFees {
  daoFees: number;
  burnFees: number;
  refFees: number;
  botFees: number;
}
const contract_interface = new ethers.utils.Interface([
  event_fees_distibution,
  event_option_fees_distibution,
])

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      const perp_fees_logs: ILog[] = (await Promise.all(perp_contract[chain].map((address: string) => sdk.api.util.getLogs({
        target: address,
        topic: '',
        keys: [],
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0_fees_distibution]
      })))).map((p: any) => p.output).flat();

      const option_fees_logs: ILog[] = (await sdk.api.util.getLogs({
        target: option_contract[chain],
        topic: '',
        keys: [],
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0_option_fees_distibution]
      })).output as ILog[];

      const fees_perp: IFees[] = perp_fees_logs.map((log: ILog) => {
        const  value = contract_interface.parseLog(log);
        const daoFees = Number(value.args.daoFees._hex) / 10 ** 18;
        const burnFees = Number(value.args.burnFees._hex) / 10 ** 18;
        const refFees = Number(value.args.refFees._hex) / 10 ** 18;
        const botFees = Number(value.args.botFees._hex) / 10 ** 18;
        return {
          daoFees,
          burnFees,
          refFees,
          botFees
        }
      })

      const fees_option: IFees[] = option_fees_logs.map((log: ILog) => {
        const value = contract_interface.parseLog(log);
        const daoFees = Number(value.args.daoFees._hex) / 10 ** 18;
        const refFees = Number(value.args.refFees._hex) / 10 ** 18;
        const botFees = Number(value.args.botFees._hex) / 10 ** 18;
        return {
          daoFees,
          refFees,
          botFees,
          burnFees: 0,
        }
      })

      const dailyFees = [...fees_perp, ...fees_option].reduce((e: number, acc: IFees) => e+acc.daoFees+acc.burnFees+acc.refFees+acc.botFees, 0);
      const dailyRev = [...fees_perp, ...fees_option].reduce((e: number, acc: IFees) => e+acc.daoFees+acc.burnFees, 0);
      const dailyHolder = [...fees_perp, ...fees_option].reduce((e: number, acc: IFees) => e+acc.burnFees, 0);
      const dailyProtocol = [...fees_perp, ...fees_option].reduce((e: number, acc: IFees) => e+acc.daoFees, 0);
      return {
        dailyFees: dailyFees.toString(),
        dailyRevenue: dailyRev.toString(),
        dailyProtocolRevenue: dailyProtocol.toString(),
        dailyHoldersRevenue: dailyHolder.toString(),
        timestamp
      }
    } catch (e) {
      console.error(e)
      throw e;
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1691884800,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1689724800,
    }
  }
}

export default adapter;
