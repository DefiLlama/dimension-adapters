import * as sdk from '@defillama/sdk';
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

type TStartTime = {
  [key: string]: number;
}
const startTimeV2: TStartTime = {
  [CHAIN.LINEA]: 1705968000,
}

// Nile is a Ramses CL fork on Linea. External voter bribes are deposited to per-gauge
// bribe sinks that emit NotifyReward(address from, address reward, uint256 amount) — all
// args non-indexed. The sinks were deployed manually rather than through the canonical
// Ramses Voter GaugeCreated event (whose feeDistributor field points at the swap-fee
// distributor, not the external-bribe sink), so they can't be enumerated on-chain. We
// instead read every NotifyReward of this shape and keep only those pushed by the
// protocol's external-bribe distributor EOAs below; this excludes the NILE-token emissions
// distributor (token inflation, not external revenue). Verified on-chain: these two EOAs
// only ever notify Nile bribe sinks (0 of 34 recipient contracts fall outside the set).
const EXTERNAL_BRIBE_NOTIFIERS = new Set([
  '0x4d319059e0b36f57de6c97db52b04a56156775b7',
  '0x83bb0eabdce3a7fef6deacb5fdb5817d6e639131',
])

// NotifyReward(address from, address reward, uint256 amount), all args non-indexed.
const NOTIFY_REWARD_TOPIC = '0xf70d5c697de7ea828df48e5c4573cb2194c659f1901f70110c52b066dcf50826'

const getBribes = async (options: FetchOptions): Promise<sdk.Balances> => {
  const dailyBribes = options.createBalances()
  const abiCoder = ethers.AbiCoder.defaultAbiCoder()
  // Fetch raw logs by topic only (no eventAbi): the NotifyReward signature is shared with
  // other Linea protocols whose variant indexes its args, and framework-side decoding with a
  // single ABI throws on the mismatched shape. Nile's bribe sinks emit the fully non-indexed
  // form — exactly one topic and three 32-byte words of data — so we decode those manually.
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

const methodology = {
  Fees: "Swap fees (0.3% per trade) plus external voter bribes deposited to the gauge bribe contracts.",
  UserFees: "User pays 0.3% fees on each swap.",
  Revenue: "100% of swap fees plus external bribes.",
  ProtocolRevenue: "8% of collected swap fees go to the protocol treasury.",
  HoldersRevenue: "92% of swap fees plus 100% of external bribes are distributed to veNILE voters.",
  SupplySideRevenue: "0% of collected fees are distributed among LPs."
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: async (options: FetchOptions) => {
        const swapAdapter = getUniV3LogAdapter({ factory: "0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42", revenueRatio: 1, userFeesRatio: 1, protocolRevenueRatio: 0.08, holdersRevenueRatio: 0.92 })
        const response = await swapAdapter(options)

        // External bribes accrue to veNILE voters. Fold them into Fees/Revenue/HoldersRevenue
        // (instead of the deprecated dailyBribesRevenue metric) so they're attributed to who
        // actually receives them.
        const bribes = await getBribes(options)
        response.dailyFees.addBalances(bribes)
        response.dailyRevenue.addBalances(bribes)
        response.dailyHoldersRevenue.addBalances(bribes)

        return response
      },
      start: startTimeV2[CHAIN.LINEA],
    },
  },
  methodology,
};

export default adapter;
