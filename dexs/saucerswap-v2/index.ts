import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { MIRROR_NODE, addKnownLeg, getMirrorNodeLogs, saucerswapBreakdownMethodology, splitRevenue } from "../../helpers/saucerswap";

const methodology = {
  Volume: "Swap volume on SaucerSwap V2 pools, read from on-chain Swap events. Each swap is valued by its HBAR, USDC or other major-token side; swaps between two long-tail tokens are not counted.",
  Fees: "Swap fees paid by users, at each pool's fee tier.",
  UserFees: "Swap fees paid by users, at each pool's fee tier.",
  SupplySideRevenue: "Swap fees paid to liquidity providers: 5/6 of the fee, or all of it in pools where the protocol fee is off.",
  Revenue: "Swap fees kept by the protocol: 1/6 of the fee in pools where the protocol fee is on, read from each pool's contract.",
  ProtocolRevenue: 'From 2025-08-31 protocol revenue buys SAUCE; this is the share sent to the Development Fund and the POL and Incentive Reserve (54.5%, 40% from 2026-07-01, 50% from 2026-09-07). Before 2025-08-31, all protocol revenue.',
  HoldersRevenue: 'From 2025-08-31 protocol revenue buys SAUCE; this is the share sent to xSAUCE stakers and burned (45.5%, 60% from 2026-07-01, 50% from 2026-09-07).',
}

const breakdownMethodology = saucerswapBreakdownMethodology('Swap fees paid by users, at each pool fee tier.')

// SaucerSwap V2 (Uniswap V3 fork) factory. It emitted the PoolCreated log of every pool in SaucerSwap's own V2 pool list (checked 2026-11-11)
// https://docs.saucerswap.finance/protocol/saucerswap-v2
const FACTORY = '0.0.3946833'
// PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
const POOL_CREATED_TOPIC = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118'
// Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
const SWAP_TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'

const SLOT0_ABI = 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
// Multicall3 on Hedera (0.0.8805443) was deployed on 2025-03-31 16:19 UTC, but the SDK uses it from block 1, so older windows call each pool on its own
const MULTICALL3_DEPLOYED = 1743437947

type Pool = { token0: string, token1: string, fee: number }

const toSigned = (word: string) => BigInt.asIntN(256, BigInt('0x' + word))
const abs = (x: bigint) => x < 0n ? -x : x

// Every pool the factory has created, keyed by the pool's EVM address (the address its Swap logs carry), with its fee tier in hundredths
// of a bip. The mirror node only filters by topic within a timestamp range, so the factory's few logs are read whole and filtered here.
async function getPools(): Promise<Record<string, Pool>> {
  return getConfig('saucerswap-v2-pools', undefined, {
    fetcher: async () => {
      const pools: Record<string, Pool> = {}
      let path = `/api/v1/contracts/${FACTORY}/results/logs?limit=100&order=asc`
      while (path) {
        const res = await httpGet(MIRROR_NODE + path)
        for (const log of res.logs) {
          if (log.topics[0] !== POOL_CREATED_TOPIC) continue
          pools['0x' + log.data.slice(-40).toLowerCase()] = {
            token0: '0.0.' + BigInt(log.topics[1]),
            token1: '0.0.' + BigInt(log.topics[2]),
            fee: Number(BigInt(log.topics[3])),
          }
        }
        path = res.links?.next
      }
      return pools
    }
  })
}

const fetch = async (options: FetchOptions) => {
  const [pools, logs] = await Promise.all([getPools(), getMirrorNodeLogs(SWAP_TOPIC, options.startTimestamp, options.endTimestamp)])
  
  const volumes: Record<string, Balances[]> = {}
  for (const log of logs) {
    const address = log.address.toLowerCase()
    const pool = pools[address]
    if (!pool) continue // Swap emitted by another Uniswap V3 fork on Hedera

    const words = log.data.slice(2).match(/.{64}/g)
    if (!words || words.length !== 5) throw new Error(`Unexpected Swap data in ${log.transaction_hash}`)
    const amount0 = toSigned(words[0])
    const amount1 = toSigned(words[1])
    const paidIn = amount0 > 0n ? 0 : 1 // a positive amount is paid into the pool

    volumes[address] ??= [options.createBalances(), options.createBalances()]
    // neither side HBAR or a core asset: skipped
    addKnownLeg(volumes[address][paidIn], pool.token0, pool.token1, abs(amount0), abs(amount1))
  }

  // slot0().feeProtocol at the window end: the protocol takes 1/N of the swap fee, N in the low 4 bits for token0 and the high 4 bits for
  // token1, 0 = off. 0x66 (1/6 each way) on 55 of 57 pools; CLXY/HBAR and HBAR/HLQT have had 0 since they were created.
  const addresses = Object.keys(volumes)
  let slot0s: Array<any> = []
  if (options.endTimestamp >= MULTICALL3_DEPLOYED) {
    slot0s = await options.api.multiCall({ abi: SLOT0_ABI, calls: addresses })
  } else {
    for (const target of addresses) slot0s.push(await options.api.call({ target, abi: SLOT0_ABI }))
  }

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  addresses.forEach((address, i) => {
    const feeRate = pools[address].fee / 1e6
    const feeProtocol = Number(slot0s[i].feeProtocol)
    const denominators = [feeProtocol % 16, feeProtocol >> 4]
    volumes[address].forEach((volume, paidIn) => {
      const protocolShare = denominators[paidIn] ? 1 / denominators[paidIn] : 0
      dailyVolume.addBalances(volume)
      dailyFees.addBalances(volume.clone(feeRate), 'Token Swap Fees')
      if (protocolShare) dailyRevenue.addBalances(volume.clone(feeRate * protocolShare), 'Swap Fees To Protocol')
      dailySupplySideRevenue.addBalances(volume.clone(feeRate * (1 - protocolShare)), 'Swap Fees To LPs')
    })
  })

  const { dailyProtocolRevenue, dailyHoldersRevenue } = splitRevenue(options, await dailyRevenue.getUSDValue())

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HEDERA],
  start: '2023-11-09', // first V2 swap on-chain: 2023-11-09 02:27 UTC (8 test swaps), then no swaps until most pools were created and trading opened on 2023-11-17
  methodology,
  breakdownMethodology,
};

export default adapter;
