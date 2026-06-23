import * as sdk from '@defillama/sdk';
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const EXTERNAL_BRIBE_NOTIFIERS = new Set([
  '0x4d319059e0b36f57de6c97db52b04a56156775b7',
  '0x83bb0eabdce3a7fef6deacb5fdb5817d6e639131',
])

const NOTIFY_REWARD_TOPIC = '0xf70d5c697de7ea828df48e5c4573cb2194c659f1901f70110c52b066dcf50826'

const getBribes = async (options: FetchOptions): Promise<sdk.Balances> => {
  const dailyBribes = options.createBalances()
  const abiCoder = ethers.AbiCoder.defaultAbiCoder()
  // Fetch raw logs by topic only (no eventAbi): the NotifyReward signature is shared with
  // other Linea protocols whose variant indexes its args, and framework-side decoding with a
  // single ABI throws on the mismatched shape. Nile's bribe sinks emit the fully non-indexed
  // form: exactly one topic and three 32-byte words of data, so we decode those manually.
  const logs = await options.getLogs({ noTarget: true, topics: [NOTIFY_REWARD_TOPIC], entireLog: true })
  logs.forEach((log: any) => {
    if (!log.topics || log.topics.length !== 1) return
    if (!log.data || (log.data.length - 2) / 64 !== 3) return
    const [from, reward, amount] = abiCoder.decode(['address', 'address', 'uint256'], log.data)
    if (!EXTERNAL_BRIBE_NOTIFIERS.has(from.toLowerCase())) return
    dailyBribes.add(reward.toLowerCase(), amount)
  }) 
  return dailyBribes
}

// https://docs.ramses.exchange/ramses-cl-v2/concentrated-liquidity/fee-distribution
const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: async (options: FetchOptions) => {
        const adapter = getUniV3LogAdapter({ factory: "0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42", revenueRatio: 1, userFeesRatio: 1, protocolRevenueRatio: 0.08, holdersRevenueRatio: 0.92 })
        const response = await adapter(options)
        const bribes = await getBribes(options);
        
        const dailyFees = options.createBalances()
        const dailyRevenue = options.createBalances()
        const dailySupplySideRevenue = options.createBalances()
        const dailyHoldersRevenue = options.createBalances()
        const dailyProtocolRevenue = options.createBalances()

        dailyFees.add(response.dailyFees, 'Token Swap Fees')
        dailyFees.add(bribes, 'Bribes Rewards')
        
        dailyRevenue.add(response.dailyProtocolRevenue, 'Token Swap Fees To Protocol')
        dailyRevenue.add(response.dailyHoldersRevenue, 'Token Swap Fees To Holders')
        dailyRevenue.add(bribes, 'Bribes Revenue')

        dailyHoldersRevenue.add(response.dailyHoldersRevenue, 'Token Swap Fees To Holders')
        dailyHoldersRevenue.add(bribes, 'Bribes Revenue')

        dailySupplySideRevenue.add(response.dailySupplySideRevenue, 'Token Swap Fees To LPs')

        dailyProtocolRevenue.add(response.dailyProtocolRevenue, 'Token Swap Fees To Protocol')

        return {
          dailyVolume: response.dailyVolume,
          dailyFees,
          dailyRevenue,
          dailySupplySideRevenue,
          dailyHoldersRevenue,
          dailyProtocolRevenue,
        };
      },
      start: '2024-01-23',
    },
  },
  methodology: {
    Fees: "User pays 0.3% fees on each swap.",
    UserFees: "User pays 0.3% fees on each swap.",
    Revenue: "100% fees are revenue",
    ProtocolRevenue: "Revenue going to the protocol. 8% of collected fees. (is probably right because the distribution is dynamic.)",
    HoldersRevenue: "User fees are distributed among holders. 92% of collected fees. (is probably right because the distribution is dynamic.)",
    SupplySideRevenue: "0% of collected fees are distributed among LPs. (is probably right because the distribution is dynamic.)"
  },
  breakdownMethodology: {
    Fees: {
      'Token Swap Fees': 'Swap fees paid by users on Nile concentrated liquidity pools.',
      'Bribes Rewards': 'External bribes deposited to Nile bribe sinks for pool voters.',
    },
    UserFees: {
      'Token Swap Fees': 'Swap fees paid by users on Nile concentrated liquidity pools.',
      'Bribes Rewards': 'External bribes deposited to Nile bribe sinks for pool voters.',
    },
    Revenue: {
      'Token Swap Fees To Protocol': 'Protocol share of Nile concentrated liquidity swap fees.',
      'Token Swap Fees To Holders': 'Holder share of Nile concentrated liquidity swap fees.',
      'Bribes Revenue': 'External bribes distributed to Nile voters.',
    },
    ProtocolRevenue: {
      'Token Swap Fees To Protocol': 'Protocol share of Nile concentrated liquidity swap fees.',
    },
    HoldersRevenue: {
      'Token Swap Fees To Holders': 'Holder share of Nile concentrated liquidity swap fees.',
      'Bribes Revenue': 'External bribes distributed to Nile voters.',
    },
    SupplySideRevenue: {
      'Token Swap Fees To LPs': 'Nile concentrated liquidity swap fees retained by LPs.',
    },
  }
};

export default adapter;
