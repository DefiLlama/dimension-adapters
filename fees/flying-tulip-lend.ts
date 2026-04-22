import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'

const LENDING_LENS = '0x3682168023e6ba8d1f995fda1d920827c5a8a43e'

const RESERVES: Record<string, string[]> = {
  [CHAIN.SONIC]: [
    '0x29219dd400f2bf60e5a23d13be72b486d4038894', // USDC
    '0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38', // wS
    '0x5dd1a7a369e8273371d2dbf9d83356057088082c', // FT (address LendingLens is configured to key on)
    '0xe5da20f15420ad15de0fa650600afc998bbe3955', // stS
    '0xf7d85ec4e7710f71992752eac2111312e73e9c9c', // ftUSD
    '0x50c42deacd8fc9773493ed674b675be577f2634b', // WETH
    '0x0555e30da8f98308edb960aa94c0db47230d2b9c', // WBTC
  ],
}

const ASSET_STATE_ABI =
  'function assetState(address) view returns (uint256 cash, uint256 borrows, uint256 reserves, uint256 utilWad)'
const ASSET_CFG_ABI =
  'function assetCfg(address) view returns (address irm, uint16 mmBps, bool enabled, bool borrowable, bool isCollateral)'
const IRM_SAMPLE_APR_ABI =
  'function irmSampleAPR(address, uint256[]) view returns (uint256[])'

const WAD = 10n ** 18n
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const reserves = RESERVES[options.chain] || []
  if (reserves.length === 0) {
    return {
      dailyFees,
      dailyRevenue: dailyProtocolRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue: options.createBalances(),
    }
  }

  const [states, cfgs] = await Promise.all([
    options.toApi.multiCall({
      target: LENDING_LENS,
      abi: ASSET_STATE_ABI,
      calls: reserves,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      target: LENDING_LENS,
      abi: ASSET_CFG_ABI,
      calls: reserves,
      permitFailure: true,
    }),
  ])

  const windowSeconds = BigInt(options.endTimestamp - options.startTimestamp)

  for (let i = 0; i < reserves.length; i++) {
    const state = states[i]
    const cfg = cfgs[i]
    if (!state || !cfg) continue
    const irm = cfg[0]
    if (!irm || irm.toLowerCase() === ZERO_ADDRESS) continue
    const borrows = BigInt(state[1])
    if (borrows === 0n) continue
    const utilWad = state[3].toString()

    const aprs = await options.toApi.call({
      target: LENDING_LENS,
      abi: IRM_SAMPLE_APR_ABI,
      params: [irm, [utilWad]],
      permitFailure: true,
    })
    if (!aprs || aprs.length === 0 || !aprs[0]) continue

    const aprWad = BigInt(aprs[0])
    const interest = (borrows * aprWad * windowSeconds) / (WAD * SECONDS_PER_YEAR)
    if (interest <= 0n) continue

    dailyFees.add(reserves[i], interest)
    dailyProtocolRevenue.add(reserves[i], interest)
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: options.createBalances(),
  }
}

const methodology = {
  Fees: 'Interest paid by borrowers estimated as borrows * borrowAPR * windowSeconds / year, read via LendingLens.assetState and IRM.irmSampleAPR.',
  Revenue:
    'All borrower interest accrues to the protocol reserves accumulator before being redistributed; tracked equal to Fees.',
  ProtocolRevenue: 'Same as Revenue.',
  SupplySideRevenue:
    'Not tracked here. Suppliers earn via FT epoch rewards and via idle liquidity deployed to Aave; those are measured separately.',
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2026-01-15',
    },
  },
}

export default adapter
