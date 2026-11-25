import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTxReceiptsWithRetry } from "../../helpers/getTxReceipts";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const FACTORY = '0x0fd83557b2be93617c9c1c1b6fd549401c74558c'
const BUNNI_HUBS = ['0xdc53487e2a6ef468260bc938f645f84caaccac6f', '0xd1fac4f51457e4a6d35bdc7311718e5d6de92bb9']
const PAY_PROTOCOL_FEE = 'event PayProtocolFee(uint256 amount0, uint256 amount1)'
const vaultEvents = new Interface([
  'event Collect(address indexed owner, address recipient, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount0, uint128 amount1)',
  PAY_PROTOCOL_FEE,
])
const VAULT_FEES_TO_HOLDERS = 'Vault Fees To esALB Holders'

const getPoolSwaps = getUniV3LogAdapter({ factory: FACTORY })

// PayProtocolFee names no pool; it belongs to the pool the hub collected from just before it in the same tx
const getVaultFeesToHolders = async (options: FetchOptions) => {
  const dailyHoldersRevenue = options.createBalances()
  const logs = await options.getLogs({ targets: BUNNI_HUBS, eventAbi: PAY_PROTOCOL_FEE, entireLog: true })
  const txHashes: string[] = [...new Set<string>(logs.map((log: any) => log.transactionHash.toLowerCase()))]
  if (!txHashes.length) return dailyHoldersRevenue

  const receipts = await getTxReceiptsWithRetry(options.chain, txHashes)
  const skims: { pool: string, amount0: bigint, amount1: bigint }[] = []
  receipts.forEach((receipt, i) => {
    if (!receipt) throw new Error(`Missing receipt for vault compound tx ${txHashes[i]}`)
    let pool: string | undefined
    for (const log of receipt.logs) {
      const event = vaultEvents.parseLog(log)
      if (event?.name === 'Collect' && BUNNI_HUBS.includes(event.args.owner.toLowerCase())) pool = log.address.toLowerCase()
      if (event?.name === 'PayProtocolFee' && BUNNI_HUBS.includes(log.address.toLowerCase())) {
        if (!pool) throw new Error(`No pool Collect before PayProtocolFee in tx ${txHashes[i]}`)
        skims.push({ pool, amount0: event.args.amount0, amount1: event.args.amount1 })
      }
    }
  })

  const pools = [...new Set(skims.map(({ pool }) => pool))]
  const [factories, token0s, token1s] = await Promise.all(['address:factory', 'address:token0', 'address:token1'].map(abi => options.api.multiCall({ abi, calls: pools })))
  for (const { pool, amount0, amount1 } of skims) {
    const i = pools.indexOf(pool)
    if (factories[i].toLowerCase() !== FACTORY) continue
    dailyHoldersRevenue.add(token0s[i], amount0, VAULT_FEES_TO_HOLDERS)
    dailyHoldersRevenue.add(token1s[i], amount1, VAULT_FEES_TO_HOLDERS)
  }
  return dailyHoldersRevenue
}

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyFees } = await getPoolSwaps(options)
  const dailyHoldersRevenue = await getVaultFeesToHolders(options)
  const dailySupplySideRevenue = dailyFees.clone(1, 'LP fees')
  dailySupplySideRevenue.subtract(dailyHoldersRevenue, 'LP fees')

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Swap volume on Alien Base V3 pools, including liquidity held by Alien Base vaults.",
  Fees: "Swap fees paid by traders at each pool's fee tier.",
  UserFees: "Swap fees paid by traders at each pool's fee tier.",
  Revenue: "Half of the swap fees earned by Alien Base vaults, paid to esALB holders when a vault compounds.",
  ProtocolRevenue: "The protocol keeps no swap fees; the pool protocol fee is off.",
  HoldersRevenue: "Half of the swap fees earned by Alien Base vaults, paid to esALB holders when a vault compounds.",
  SupplySideRevenue: "Swap fees kept by liquidity providers, minus the vault share paid to esALB holders.",
}

const breakdownMethodology = {
  Fees: { 'Token Swap Fees': "Swap fees paid by traders at each pool's fee tier." },
  UserFees: { 'Token Swap Fees': "Swap fees paid by traders at each pool's fee tier." },
  Revenue: { [VAULT_FEES_TO_HOLDERS]: "Half of vault swap fees, paid to esALB holders at each compound." },
  HoldersRevenue: { [VAULT_FEES_TO_HOLDERS]: "Half of vault swap fees, paid to esALB holders at each compound." },
  SupplySideRevenue: { 'LP fees': "Swap fees kept by liquidity providers, minus the vault share paid to esALB holders." },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // a compound pays out vault fees accrued since the previous compound, which can exceed the LP fees of that window
  allowNegativeValue: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2023-11-27',
  methodology,
  breakdownMethodology,
}

export default adapter
