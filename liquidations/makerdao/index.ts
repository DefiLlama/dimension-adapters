import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

// Liquidations 2.0: every vault liquidation goes through the Dog, which emits Bark with the collateral
// it confiscates (ink, an 18 decimal internal amount) before sending it to the ilk's Clipper for auction.
const DOG = '0x135954d155898D42C90D2a57824C690e0c7BEf1B'
const ILK_REGISTRY = '0x5a464C28D19848f44199D003BeF5ecc87d090F87'

const abis = {
  Bark: 'event Bark(bytes32 indexed ilk, address indexed urn, uint256 ink, uint256 art, uint256 due, address clip, uint256 indexed id)',
  gem: 'function gem(bytes32) view returns (address)',
  dec: 'function dec(bytes32) view returns (uint256)',
}

const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const barks: any[] = await options.getLogs({ target: DOG, eventAbi: abis.Bark })
  if (!barks.length) return { dailyCollateralLiquidated }

  // offboarded ilks are wiped from the registry, so read it at the start of the window when the ilk
  // was still live, and at the end for an ilk onboarded during the window
  const ilks = [...new Set(barks.map((b) => String(b.ilk).toLowerCase()))]
  const ilkInfo: Record<string, { gem: string; dec: number }> = {}
  for (const api of [options.fromApi, options.toApi]) {
    const missing = ilks.filter((ilk) => !ilkInfo[ilk])
    if (!missing.length) break
    const calls = missing.map((ilk) => ({ target: ILK_REGISTRY, params: [ilk] }))
    const [gems, decs] = await Promise.all([
      api.multiCall({ abi: abis.gem, calls, permitFailure: true }),
      api.multiCall({ abi: abis.dec, calls, permitFailure: true }),
    ])
    missing.forEach((ilk, i) => {
      if (gems[i] && gems[i] !== '0x0000000000000000000000000000000000000000') ilkInfo[ilk] = { gem: gems[i], dec: Number(decs[i]) }
    })
  }

  for (const bark of barks) {
    const info = ilkInfo[String(bark.ilk).toLowerCase()]
    if (!info) throw new Error(`makerdao: ilk ${bark.ilk} not found in the IlkRegistry`)
    dailyCollateralLiquidated.add(info.gem, BigInt(bark.ink) / 10n ** BigInt(18 - info.dec))
  }

  return { dailyCollateralLiquidated }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2021-04-15',
  methodology: {
    CollateralLiquidated: 'Collateral confiscated from vaults in Dog Bark events (Liquidations 2.0), converted from the internal 18 decimal amount to the collateral token using the IlkRegistry gem and dec.',
  },
}

export default adapter
