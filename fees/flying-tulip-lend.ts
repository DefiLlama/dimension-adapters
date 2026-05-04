import { CHAIN } from '../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../adapters/types'

const LENDING_LENS = '0x3682168023e6ba8d1f995fda1d920827c5a8a43e'

// Reserves are maintained off chain. Flying Tulip's LendingLens does not expose
// a public enumeration method (no getReserves / allAssets / reservesList). The
// authoritative list lives in Flying Tulip's backend config and is mirrored by
// the public API. To refresh this list, call:
//     curl https://api.flyingtulip.com/mm/lend | jq '.data.chains[0].assets[].address'
// Contract reference: https://sonicscan.org/address/0x3682168023e6ba8d1f995fda1d920827c5a8a43e
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

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const reserves = RESERVES[options.chain] || []
  if (reserves.length === 0) {
    return {
      dailyFees,
      dailyRevenue: dailyProtocolRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
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

  // Collect every reserve that has a valid IRM and non zero borrows, then batch
  // the APR reads into a single multiCall to avoid N sequential RPCs.
  const aprCalls: { target: string; params: any[] }[] = []
  const aprIndex: number[] = []
  for (let i = 0; i < reserves.length; i++) {
    const state = states[i]
    const cfg = cfgs[i]
    if (!state || !cfg) continue
    const irm = cfg[0]
    if (!irm || irm.toLowerCase() === ZERO_ADDRESS) continue
    const borrows = BigInt(state[1])
    if (borrows === 0n) continue
    aprCalls.push({ target: LENDING_LENS, params: [irm, [state[3].toString()]] })
    aprIndex.push(i)
  }

  const aprResults = await options.toApi.multiCall({
    abi: IRM_SAMPLE_APR_ABI,
    calls: aprCalls,
    permitFailure: true,
  })

  for (let k = 0; k < aprIndex.length; k++) {
    const i = aprIndex[k]
    const aprs = aprResults[k]
    if (!aprs || aprs.length === 0 || !aprs[0]) continue
    const borrows = BigInt(states[i][1])
    const aprWad = BigInt(aprs[0])
    const interest = (borrows * aprWad * windowSeconds) / (WAD * SECONDS_PER_YEAR)
    if (interest <= 0n) continue
    dailyFees.add(reserves[i], interest, 'Borrow Interest')
    dailySupplySideRevenue.add(reserves[i], interest, 'Borrow Interest To Lenders')
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Interest paid by borrowers across every reserve on Flying Tulip Lend, estimated as borrows * IRM.irmSampleAPR(util) * windowSeconds / year. State and rate samples read via LendingLens.',
  Revenue:
    'Protocol retains no reserve factor on chain. All borrower interest is routed back to suppliers as FT denominated rewards, so protocol revenue is 0.',
  ProtocolRevenue: 'Same as Revenue, tracked as 0.',
  SupplySideRevenue:
    'Total borrower interest. The on chain reserves accumulator collects interest first, then the protocol uses those fees to buy FT on the open market and distributes the FT to suppliers quarterly through the EpochRewardsVault. FT has a fixed total supply so nothing is minted.',
}

const breakdownMethodology = {
  Fees: {
    'Borrow Interest': 'Interest paid by borrowers across every reserve, estimated as borrows * IRM.irmSampleAPR(util) * windowSeconds / year.',
  },
  SupplySideRevenue: {
    'Borrow Interest To Lenders': 'Total borrower interest accrues to the on chain reserves accumulator; the protocol then buys FT on the open market with these fees and distributes it to suppliers quarterly through the EpochRewardsVault.',
  },
}

const adapter: SimpleAdapter = {
  version: 1, // Interests are low, no need to run every hour
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2026-03-23',
    },
  },
}

export default adapter
