import { CHAIN } from '../helpers/chains'
import { getPoolFees, AaveLendingPoolConfig } from '../helpers/aave'
import { BaseAdapter, FetchOptions, SimpleAdapter } from '../adapters/types'
import ADDRESSES from '../helpers/coreAssets.json'
import { addTokensReceived } from '../helpers/token'
import { METRIC } from '../helpers/metrics'

const AaveMarkets: {[key: string]: Array<AaveLendingPoolConfig>} = {
  [CHAIN.ETHEREUM]: [
    // core market
    {
      version: 3,
      lendingPoolProxy: '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2',
      dataProvider: '0x7b4eb56e7cd4b454ba8ff71e4518426369a138a3',
      dataProvider2: '0x41393e5e337606dc3821075Af65AeE84D7688CBD',
      selfLoanAssets: {
        '0x40d16fc0246ad3160ccc09b8d0d3a2cd28ae6c2f': 'GHO',
      }
    },

    // lido market
    {
      version: 3,
      lendingPoolProxy: '0x4e033931ad43597d96d6bcc25c280717730b58b1',
      dataProvider: '0xa3206d66cf94aa1e93b21a9d8d409d6375309f4a',
      dataProvider2: '0x08795CFE08C7a81dCDFf482BbAAF474B240f31cD'
    },

    // ether.fi market
    {
      version: 3,
      lendingPoolProxy: '0x0AA97c284e98396202b6A04024F5E2c65026F3c0',
      dataProvider: '0x8Cb4b66f7B13F2Ae4D3c91338fC007dbF8C14208',
      dataProvider2: '0xE7d490885A68f00d9886508DF281D67263ed5758'
    },

    // horizon market
    {
      version: 3,
      lendingPoolProxy: '0xAe05Cd22df81871bc7cC2a04BeCfb516bFe332C8',
      dataProvider: '0x53519c32f73fE1797d10210c4950fFeBa3b21504',
    },
  ],
  [CHAIN.OPTIMISM]: [
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
      dataProvider2: '0x7F23D86Ee20D869112572136221e173428DD740B'
    },
  ],
  [CHAIN.ARBITRUM]: [
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
      dataProvider2: '0x7F23D86Ee20D869112572136221e173428DD740B'
    },
  ],
  [CHAIN.POLYGON]: [
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
      dataProvider2: '0x7F23D86Ee20D869112572136221e173428DD740B'
    },
  ],
  [CHAIN.AVAX]: [
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
      dataProvider2: '0x7F23D86Ee20D869112572136221e173428DD740B'
    },
  ],
  [CHAIN.FANTOM]: [
    {
      version: 3,
      lendingPoolProxy: '0x794a61358d6845594f94dc1db02a252b5b4814ad',
      dataProvider: '0x69fa688f1dc47d4b5d8029d5a35fb7a548310654',
      dataProvider2: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654'
    },
  ],
  [CHAIN.BASE]: [
    {
      version: 3,
      lendingPoolProxy: '0xa238dd80c259a72e81d7e4664a9801593f98d1c5',
      dataProvider: '0x2d8a3c5677189723c4cb8873cfc9c8976fdf38ac',
      dataProvider2: '0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad'
    },
  ],
  [CHAIN.METIS]: [
    {
      version: 3,
      lendingPoolProxy: '0x90df02551bb792286e8d4f13e0e357b4bf1d6a57',
      dataProvider: '0x99411fc17ad1b56f49719e3850b2cdcc0f9bbfd8',
      dataProvider2: '0xC01372469A17b6716A38F00c277533917B6859c0'
    },
  ],
  [CHAIN.XDAI]: [
    {
      version: 3,
      lendingPoolProxy: '0xb50201558b00496a145fe76f7424749556e326d8',
      dataProvider: '0x501b4c19dd9c2e06e94da7b6d5ed4dda013ec741',
      dataProvider2: '0x57038C3e3Fe0a170BB72DE2fD56E98e4d1a69717'
    },
  ],
  [CHAIN.BSC]: [
    {
      version: 3,
      lendingPoolProxy: '0x6807dc923806fe8fd134338eabca509979a7e0cb',
      dataProvider: '0x41585c50524fb8c3899b43d7d797d9486aac94db',
      dataProvider2: '0x23dF2a19384231aFD114b036C14b6b03324D79BC'
    },
  ],
  [CHAIN.SCROLL]: [
    {
      version: 3,
      lendingPoolProxy: '0x11fCfe756c05AD438e312a7fd934381537D3cFfe',
      dataProvider: '0xa99F4E69acF23C6838DE90dD1B5c02EA928A53ee',
      dataProvider2: '0xe2108b60623C6Dcf7bBd535bD15a451fd0811f7b'
    },
  ],
  [CHAIN.ERA]: [
    {
      version: 3,
      lendingPoolProxy: '0x78e30497a3c7527d953c6B1E3541b021A98Ac43c',
      dataProvider: '0x48B96565291d1B23a014bb9f68E07F4B2bb3Cd6D',
      dataProvider2: '0x5F2A704cE47B373c908fE8A29514249469b52b99'
    },
  ],
  [CHAIN.LINEA]: [
    {
      version: 3,
      lendingPoolProxy: '0xc47b8C00b0f69a36fa203Ffeac0334874574a8Ac',
      dataProvider: '0x2D97F8FA96886Fd923c065F5457F9DDd494e3877',
    },
  ],
  [CHAIN.SONIC]: [
    {
      version: 3,
      lendingPoolProxy: '0x5362dBb1e601abF3a4c14c22ffEdA64042E5eAA3',
      dataProvider: '0x306c124fFba5f2Bc0BcAf40D249cf19D492440b9',
    },
  ],
  [CHAIN.CELO]: [
    {
      version: 3,
      lendingPoolProxy: '0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402',
      dataProvider: '0x33b7d355613110b4E842f5f7057Ccd36fb4cee28',
    },
  ],
  [CHAIN.SONEIUM]: [
    {
      version: 3,
      lendingPoolProxy: '0xDd3d7A7d03D9fD9ef45f3E587922eF65CA38B',
      dataProvider: '0xa0208CE8356ad6C5EC6dFb8996c9A6B828212022',
    },
  ],
  [CHAIN.PLASMA]: [
    {
      version: 3,
      lendingPoolProxy: '0x925a2A7214Ed92428B5b1B090F80b25700095e12',
      dataProvider: '0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F',
    },
  ],
  [CHAIN.MEGAETH]: [
    {
      version: 3,
      lendingPoolProxy: '0x7e324AbC5De01d112AfC03a584966ff199741C28',
      dataProvider: '0x9588b453A4EE24a420830CB3302195cA7aA3b403',
    },
  ],
  [CHAIN.MANTLE]: [
    {
      version: 3,
      lendingPoolProxy: '0x458F293454fE0d67EC0655f3672301301DD51422',
      dataProvider: '0x487c5c669D9eee6057C44973207101276cf73b68',
    },
  ],
}

const methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Aave treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Aave treasury.',
  HoldersRevenue: 'Aave starts buy back AAVE tokens using Aave Treasury after 9th April 2025.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets (excluding GHO).',
    'Borrow Interest GHO': 'All interest paid by borrowers from GHO only.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'A portion of interest paid by borrowers from all markets (excluding GHO).',
    'Borrow Interest GHO': 'All 100% interest paid by GHO borrowers.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets (excluding GHO).',
    'Borrow Interest GHO': 'No supply side revenue for lenders on GHO market.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses are distributed to lenders.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets (excluding GHO) are collected by Aave treasury.',
    'Borrow Interest GHO': 'All interest paid on GHO market are collected by Aave treasury.',
    [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses are colected by Aave treasury.',
    [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors are collected by Aave treasury.',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "Aave starts buy back AAVE tokens using Aave Treasury after 9th April 2025. They bought daily basic, but there are days they didn't."
  },
}

const chainConfig = {
  [CHAIN.ETHEREUM]: {
    pools: AaveMarkets[CHAIN.ETHEREUM],
    start: '2023-01-01',
  },
  [CHAIN.OPTIMISM]: {
    pools: AaveMarkets[CHAIN.OPTIMISM],
    start: '2022-08-05',
  },
  [CHAIN.ARBITRUM]: {
    pools: AaveMarkets[CHAIN.ARBITRUM],
    start: '2022-03-12',
  },
  [CHAIN.POLYGON]: {
    pools: AaveMarkets[CHAIN.POLYGON],
    start: '2022-03-12',
  },
  [CHAIN.AVAX]: {
    pools: AaveMarkets[CHAIN.AVAX],
    start: '2022-03-12',
  },
  [CHAIN.FANTOM]: {
    pools: AaveMarkets[CHAIN.FANTOM],
    start: '2022-03-12',
  },
  [CHAIN.BASE]: {
    pools: AaveMarkets[CHAIN.BASE],
    start: '2023-08-09',
  },
  [CHAIN.BSC]: {
    pools: AaveMarkets[CHAIN.BSC],
    start: '2023-11-18',
  },
  [CHAIN.METIS]: {
    pools: AaveMarkets[CHAIN.METIS],
    start: '2023-04-24',
  },
  [CHAIN.XDAI]: {
    pools: AaveMarkets[CHAIN.XDAI],
    start: '2023-10-05',
  },
  [CHAIN.SCROLL]: {
    pools: AaveMarkets[CHAIN.SCROLL],
    start: '2024-01-21',
  },
  [CHAIN.ERA]: {
    pools: AaveMarkets[CHAIN.ERA],
    start: '2024-09-09',
  },
  [CHAIN.LINEA]: {
    pools: AaveMarkets[CHAIN.LINEA],
    start: '2024-11-24',
  },
  [CHAIN.SONIC]: {
    pools: AaveMarkets[CHAIN.SONIC],
    start: '2025-02-16',
  },
  [CHAIN.CELO]: {
    pools: AaveMarkets[CHAIN.CELO],
    start: '2025-02-16',
  },
  [CHAIN.SONEIUM]: {
    pools: AaveMarkets[CHAIN.SONEIUM],
    start: '2025-05-14',
  },
  [CHAIN.PLASMA]: {
    pools: AaveMarkets[CHAIN.PLASMA],
    start: '2025-09-25',
  },
  [CHAIN.MEGAETH]: {
    pools: AaveMarkets[CHAIN.MEGAETH],
    start: '2026-02-09',
  },
  [CHAIN.MANTLE]: {
    pools: AaveMarkets[CHAIN.MEGAETH],
    start: '2026-01-16',
  },
}

const fetch = async (options: FetchOptions) => {
  let dailyFees = options.createBalances()
  let dailyProtocolRevenue = options.createBalances()
  let dailySupplySideRevenue = options.createBalances()

  // There was an upgrade between these dates (Oct 8-17, 2024) and the dataProvider contracts don't work, so we use the backup contracts
  const pools = AaveMarkets[options.chain].map(pool => {
    if (pool.dataProvider2 &&
        options.startTimestamp >= 1728345600 &&
        options.endTimestamp <= 1729209599) {
      return { ...pool, dataProvider: pool.dataProvider2 };
    }
    return pool;
  });

  for (const pool of pools) {
    await getPoolFees(pool, options, {
      dailyFees,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
    })
  }

  let dailyHoldersRevenue = options.createBalances()
  if (options.chain === CHAIN.ETHEREUM) {
    // AAVE Buybacks https://app.aave.com/governance/v3/proposal/?proposalId=286
    const aaveReceived = await addTokensReceived({ options, tokens: [ADDRESSES.ethereum.AAVE], target: '0x22740deBa78d5a0c24C58C740e3715ec29de1bFa' })
    dailyHoldersRevenue.addBalances(aaveReceived, METRIC.TOKEN_BUY_BACK)
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {}
}
for (const [chain, config] of Object.entries(chainConfig)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch,
    start: config.start,
  }
}

export default adapter
