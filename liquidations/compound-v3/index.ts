import { CHAIN } from '../../helpers/chains'
import { BaseAdapter, FetchOptions, SimpleAdapter } from '../../adapters/types'

const AbsorbCollateralEvent = 'event AbsorbCollateral(address indexed absorber, address indexed borrower, address indexed asset, uint256 collateralAbsorbed, uint256 usdValue)'
const AbsorbDebtEvent = 'event AbsorbDebt(address indexed absorber, address indexed borrower, uint256 basePaidOut, uint256 usdValue)'

const config: { [chain: string]: { comets: string[]; start: string } } = {
  [CHAIN.ETHEREUM]: {
    comets: [
      '0xc3d688b66703497daa19211eedff47f25384cdc3',
      '0xA17581A9E3356d9A858b789D68B4d866e593aE94',
      '0x3afdc9bca9213a35503b077a6072f3d0d5ab0840',
      '0x3D0bb1ccaB520A66e607822fC55BC921738fAFE3',
      '0x5D409e56D886231aDAf00c8775665AD0f9897b56',
      '0xe85Dc543813B8c2CFEaAc371517b925a166a9293',
    ],
    start: '2022-08-14',
  },
  [CHAIN.POLYGON]: {
    comets: [
      '0xF25212E676D1F7F89Cd72fFEe66158f541246445',
      '0xaeb318360f27748acb200ce616e389a6c9409a07',
    ],
    start: '2023-02-19',
  },
  [CHAIN.ARBITRUM]: {
    comets: [
      '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA',
      '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
      '0x6f7d514bbd4aff3bcd1140b7344b32f063dee486',
      '0xd98be00b5d27fc98112bde293e487f8d4ca57d07',
    ],
    start: '2023-05-05',
  },
  [CHAIN.BASE]: {
    comets: [
      '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf',
      '0xb125E6687d4313864e53df431d5425969c15Eb2F',
      '0x46e6b214b524310239732D51387075E0e70970bf',
      '0x784efeB622244d2348d4F2522f8860B96fbEcE89',
      '0x2c776041CCFe903071AF44aa147368a9c8EEA518',
    ],
    start: '2023-08-05',
  },
  [CHAIN.SCROLL]: {
    comets: ['0xB2f97c1Bd3bf02f5e74d13f02E3e26F93D77CE44'],
    start: '2024-02-17',
  },
  [CHAIN.OPTIMISM]: {
    comets: [
      '0x2e44e174f7D53F0212823acC11C01A11d58c5bCB',
      '0x995e394b8b2437ac8ce61ee0bc610d617962b214',
      '0xe36a30d249f7761327fd973001a32010b521b6fd',
    ],
    start: '2024-04-07',
  },
  [CHAIN.MANTLE]: {
    comets: ['0x606174f62cd968d8e684c645080fa694c1D7786E'],
    start: '2024-10-24',
  },
  [CHAIN.LINEA]: {
    comets: ['0x8D38A3d6B3c3B7d96D6536DA7Eef94A9d7dbC991'],
    start: '2025-02-01',
  },
  [CHAIN.UNICHAIN]: {
    comets: ['0x2c7118c4C88B9841FCF839074c26Ae8f035f2921'],
    start: '2025-02-19',
  },
}

const fetch = async (options: FetchOptions) => {
  const dailyLiquidations = options.createBalances()
  const dailyLiquidatedDebt = options.createBalances()

  const { comets } = config[options.chain]

  // Resolve base token for each comet (needed for AbsorbDebt which uses basePaidOut)
  const baseTokens = await options.api.multiCall({
    abi: 'address:baseToken',
    calls: comets,
    permitFailure: true,
  })

  for (let i = 0; i < comets.length; i++) {
    const comet = comets[i]
    const baseToken = baseTokens[i]

    const absorbCollateralEvents: any[] = await options.getLogs({
      target: comet,
      eventAbi: AbsorbCollateralEvent,
    })
    for (const e of absorbCollateralEvents) {
      dailyLiquidations.add(e.asset, e.collateralAbsorbed)
    }

    if (baseToken) {
      const absorbDebtEvents: any[] = await options.getLogs({
        target: comet,
        eventAbi: AbsorbDebtEvent,
      })
      for (const e of absorbDebtEvents) {
        dailyLiquidatedDebt.add(baseToken, e.basePaidOut)
      }
    }
  }

  return { dailyLiquidations, dailyLiquidatedDebt }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ) as BaseAdapter,
  methodology: {
    Liquidations: 'Total USD value of collateral absorbed in Compound V3 (Comet) AbsorbCollateral events.',
    LiquidatedDebt: 'Total USD value of debt absorbed by the protocol in Compound V3 (Comet) AbsorbDebt events.',
  },
}

export default adapter