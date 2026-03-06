import { BaseAdapter, FetchOptions, IStartTimestamp, SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import AaveAbis from './abi';
import {decodeReserveConfig} from "./helper";
import { METRIC } from '../../helpers/metrics';
import { CHAIN } from '../../helpers/chains';
import { createFactoryExports } from '../../factory/registry';

export interface AaveLendingPoolConfig {
  version: 1 | 2 | 3;
  lendingPoolProxy: string;
  dataProvider: string;
  dataProvider2?: string;
  ignoreLiquidation?: boolean;
  ignoreFlashloan?: boolean;

  // GHO on aave
  selfLoanAssets?: {
    // address => symbol
    [key: string]: string;
  },
}

export interface AaveAdapterExportConfig {
  start?: IStartTimestamp | number | string;
  pools: Array<AaveLendingPoolConfig>;
}

// PercentageMath uses 4 decimals: https://etherscan.io/address/0x02d84abd89ee9db409572f19b6e1596c301f3c81#code#F17#L15
const PercentageMathDecimals = 1e4;

// https://etherscan.io/address/0x02d84abd89ee9db409572f19b6e1596c301f3c81#code#F16#L16
const LiquidityIndexDecimals = BigInt(1e27);

export async function getPoolFees(pool: AaveLendingPoolConfig, options: FetchOptions, balances: {
  dailyFees: sdk.Balances,
  dailySupplySideRevenue: sdk.Balances,
  dailyProtocolRevenue: sdk.Balances,
}) {
  // get reserve (token) list which are supported by the lending pool
  const reservesList: Array<string> = await options.fromApi.call({
    target: pool.lendingPoolProxy,
    abi: pool.version === 1 ? AaveAbis.getReserves : AaveAbis.getReservesList,
    permitFailure: true,
  })

  // in this case the market is not exists yet
  if (!reservesList || reservesList.length == 0) {
    return;
  }

  // get reserve configs
  const reserveConfigs = pool.version === 1 ? [] : await options.fromApi.multiCall({
    abi: AaveAbis.getReserveConfiguration,
    target: pool.dataProvider,
    calls: reservesList,
  })
  
  // get reserves factors
  const reserveFactors: Array<number> = pool.version === 1
    ? reservesList.map(_ => 0)
    : reserveConfigs.map((config: any) => Number(config.reserveFactor))

  // count fees by growth liquidity index
  const reserveDataBefore = await options.fromApi.multiCall({
    abi: pool.version === 1 ? AaveAbis.getReserveDataV1 : pool.version === 2 ? AaveAbis.getReserveDataV2 : AaveAbis.getReserveDataV3,
    target: pool.dataProvider,
    calls: reservesList,
  })
  const reserveDataAfter = await options.toApi.multiCall({
    abi: pool.version === 1 ? AaveAbis.getReserveDataV1 : pool.version === 2 ? AaveAbis.getReserveDataV2 : AaveAbis.getReserveDataV3,
    target: pool.dataProvider,
    calls: reservesList,
  })

  // all calculations use BigInt because aave math has 27 decimals
  for (let reserveIndex = 0; reserveIndex < reservesList.length; reserveIndex++) {
    let totalLiquidity = BigInt(0)
    let totalVariableDebt = BigInt(0)
    if (pool.version === 1) {
      totalLiquidity = BigInt(reserveDataBefore[reserveIndex].totalLiquidity)
    } else if (pool.version === 2) {
      // = available + borrowed
      totalLiquidity = BigInt(reserveDataBefore[reserveIndex].availableLiquidity)
        + BigInt(reserveDataBefore[reserveIndex].totalStableDebt)
        + BigInt(reserveDataBefore[reserveIndex].totalVariableDebt)
    } else {
      totalLiquidity = BigInt(reserveDataBefore[reserveIndex].totalAToken)
      totalVariableDebt = BigInt(reserveDataBefore[reserveIndex].totalVariableDebt)
    }

    const token = reservesList[reserveIndex].toLowerCase()
    const reserveFactor = reserveFactors[reserveIndex] / PercentageMathDecimals

    if (pool.selfLoanAssets && pool.selfLoanAssets[token]) {
      // self-loan assets, no supply-side revenue
      const symbol = pool.selfLoanAssets[token]
      const reserveVariableBorrowIndexBefore = BigInt(reserveDataBefore[reserveIndex].variableBorrowIndex)
      const reserveVariableBorrowIndexAfter = BigInt(reserveDataAfter[reserveIndex].variableBorrowIndex)
      const growthVariableBorrowIndex = reserveVariableBorrowIndexAfter - reserveVariableBorrowIndexBefore
      const interestAccrued = totalVariableDebt * growthVariableBorrowIndex / LiquidityIndexDecimals

      balances.dailyFees.add(token, interestAccrued, `${METRIC.BORROW_INTEREST} ${symbol}`)
      balances.dailySupplySideRevenue.add(token, 0, `${METRIC.BORROW_INTEREST} ${symbol}`)
      balances.dailyProtocolRevenue.add(token, interestAccrued, `${METRIC.BORROW_INTEREST} ${symbol}`)
    } else {
      // normal reserves
      const reserveLiquidityIndexBefore = BigInt(reserveDataBefore[reserveIndex].liquidityIndex)
      const reserveLiquidityIndexAfter = BigInt(reserveDataAfter[reserveIndex].liquidityIndex)
      const growthLiquidityIndex = reserveLiquidityIndexAfter - reserveLiquidityIndexBefore
      
      // contracts substract reserve/revenue from liquidity index
      const supplySideInterestAccrued = totalLiquidity * growthLiquidityIndex / LiquidityIndexDecimals
      const interestAccrued = Number(supplySideInterestAccrued) / Number(1 - reserveFactor)
      const revenueAccrued = interestAccrued - Number(supplySideInterestAccrued)

      balances.dailyFees.add(token, interestAccrued, METRIC.BORROW_INTEREST)
      balances.dailySupplySideRevenue.add(token, supplySideInterestAccrued, METRIC.BORROW_INTEREST)
      balances.dailyProtocolRevenue.add(token, revenueAccrued, METRIC.BORROW_INTEREST)
    }
  }

  if (!pool.ignoreFlashloan) {
    // get flashloan fees
    const flashloanEvents = await options.getLogs({
      target: pool.lendingPoolProxy,
      eventAbi: AaveAbis.FlashloanEvent,
    })
    if (flashloanEvents.length > 0) {
      // const FLASHLOAN_PREMIUM_TOTAL = await options.fromApi.call({
      //   target: pool.lendingPoolProxy,
      //   abi: AaveAbis.FLASHLOAN_PREMIUM_TOTAL,
      // })
      const FLASHLOAN_PREMIUM_TO_PROTOCOL = await options.fromApi.call({
        target: pool.lendingPoolProxy,
        abi: AaveAbis.FLASHLOAN_PREMIUM_TO_PROTOCOL,
      })
      // const flashloanFeeRate = Number(FLASHLOAN_PREMIUM_TOTAL) / 1e4
      const flashloanFeeProtocolRate = Number(FLASHLOAN_PREMIUM_TO_PROTOCOL) / 1e4
  
      for (const event of flashloanEvents) {
        const flashloanPremiumForProtocol = Number(event.premium) * flashloanFeeProtocolRate
  
        balances.dailyFees.add(event.asset, flashloanPremiumForProtocol, METRIC.FLASHLOAN_FEES)
        balances.dailyProtocolRevenue.add(event.asset, flashloanPremiumForProtocol, METRIC.FLASHLOAN_FEES)
        
        // we don't count flashloan premium for LP as fees
        // because they have already counted in liquidity index
        balances.dailySupplySideRevenue.add(event.asset, 0)
      }
    }
  }

  if (!pool.ignoreLiquidation) {
    // aave v3 has liquidation protocol fees which is a partition from liquidation bonus
    if (pool.version === 3) {
      const liquidationEvents: Array<any> = await options.getLogs({
        target: pool.lendingPoolProxy,
        eventAbi: AaveAbis.LiquidationEvent,
      })
      if (liquidationEvents.length > 0) {
        const liquidationProtocolFees = (await options.api.multiCall({
          abi: AaveAbis.getConfiguration,
          target: pool.lendingPoolProxy,
          calls: reservesList,
        })).map((config: any) => {
          return Number(decodeReserveConfig(config.data).liquidationProtocolFee)
        })
    
        const reserveLiquidationConfigs: {[key: string]: {
          bonus: number;
          protocolFee: number;
        }} = {}
        for (let i = 0; i < reservesList.length; i++) {
          reserveLiquidationConfigs[sdk.util.normalizeAddress(reservesList[i])] = {
            bonus: Number(reserveConfigs[i].liquidationBonus),
            protocolFee: liquidationProtocolFees[i],
          }
        }
  
        for (const event of liquidationEvents) {
          /**
           * The math calculation for liquidation fees
           * 
           * where:
           * e - collateral amount emitted from the event
           * x - liquidation bonus rate
           * y - liquidation protocol fee rate
           * a - liquidated collateral amount
           * b - liquidation bonus
           * b2 - liquidation bonus fees for protocol
           * 
           * 1. b2 = yb
           * 
           * 2. e = a + b
           * 
           * 3. b = xa
           * 
           * from 1, 2, 3:
           * b = (e - e / x)
           * b2 = b * y
           * 
           */
    
          const e = Number(event.liquidatedCollateralAmount)
          const x = reserveLiquidationConfigs[sdk.util.normalizeAddress(event.collateralAsset)].bonus / PercentageMathDecimals
          const y = reserveLiquidationConfigs[sdk.util.normalizeAddress(event.collateralAsset)].protocolFee / PercentageMathDecimals
  
          // protocol fees from liquidation bonus
          const b = (e - e / x)
          const b2 = b * y
  
          // count liquidation bonus as fees
          balances.dailyFees.add(event.collateralAsset, b, METRIC.LIQUIDATION_FEES)
  
          // count liquidation bonus for liquidator as supply side fees
          balances.dailySupplySideRevenue.add(event.collateralAsset, b - b2, METRIC.LIQUIDATION_FEES)
  
          // count liquidation bonus protocol fee as revenue
          balances.dailyProtocolRevenue.add(event.collateralAsset, b2, METRIC.LIQUIDATION_FEES)
        }
      }
    }
  }
}

export function aaveExport(exportConfig: {[key: string]: AaveAdapterExportConfig}) {
  const exportObject: BaseAdapter = {}
  Object.entries(exportConfig).map(([chain, config]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        let dailyFees = options.createBalances()
        let dailyProtocolRevenue = options.createBalances()
        let dailySupplySideRevenue = options.createBalances()

        for (const pool of config.pools) {
          await getPoolFees(pool, options, {
            dailyFees,
            dailySupplySideRevenue,
            dailyProtocolRevenue,
          })
        }

        return {
          dailyFees,
          dailyRevenue: dailyProtocolRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
        }
      }),
      start: config.start,
    }
  })
  return exportObject
}

// --- Factory registry section ---

const aaveV1V2Methodology = {
  Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
  Revenue: 'Amount of fees go to Aave treasury.',
  SupplySideRevenue: 'Amount of fees distributed to suppliers.',
  ProtocolRevenue: 'Amount of fees go to Aave treasury.',
}

const aaveV1V2BreakdownMethodology = {
  Fees: {
    'Borrow Interest': 'All interest paid by borrowers from all markets (excluding GHO).',
    'Borrow Interest GHO': 'All interest paid by borrowers from GHO only.',
    'Liquidation Fees': 'Fees from liquidation penalty and bonuses.',
    'Flashloan Fees': 'Flashloan fees paid by flashloan borrowers and executors.',
  },
  Revenue: {
    'Borrow Interest': 'A portion of interest paid by borrowers from all markets (excluding GHO).',
    'Borrow Interest GHO': 'All 100% interest paid by GHO borrowers.',
    'Liquidation Fees': 'A portion of fees from liquidation penalty and bonuses.',
    'Flashloan Fees': 'A portion of fees paid by flashloan borrowers and executors.',
  },
  SupplySideRevenue: {
    'Borrow Interest': 'Amount of interest distributed to lenders from all markets (excluding GHO).',
    'Borrow Interest GHO': 'No supply side revenue for lenders on GHO market.',
    'Liquidation Fees': 'Fees from liquidation penalty and bonuses are distributed to lenders.',
    'Flashloan Fees': 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
  },
  ProtocolRevenue: {
    'Borrow Interest': 'Amount of interest distributed to lenders from all markets (excluding GHO) are collected by Aave treasury.',
    'Borrow Interest GHO': 'All interest paid on GHO market are collected by Aave treasury.',
    'Liquidation Fees': 'A portion of fees from liquidation penalty and bonuses are colected by Aave treasury.',
    'Flashloan Fees': 'A portion of fees paid by flashloan borrowers and executors are collected by Aave treasury.',
  },
}

function aaveAdapter(config: {[key: string]: AaveAdapterExportConfig}, global?: Partial<SimpleAdapter>): SimpleAdapter {
  return { version: 2, adapter: aaveExport(config), ...global };
}

const aaveProtocolConfigs: Record<string, { config: {[key: string]: AaveAdapterExportConfig}, global?: Partial<SimpleAdapter> }> = {
  'aave-v1': {
    config: {
      [CHAIN.ETHEREUM]: {
        start: '2020-01-09',
        pools: [
          {
            version: 1,
            lendingPoolProxy: '0x398eC7346DcD622eDc5ae82352F02bE94C62d119',
            dataProvider: '0x082B0cA59f2122c94E5F57Db0085907fa9584BA6',
          },
        ],
      },
    },
    global: { methodology: aaveV1V2Methodology, breakdownMethodology: aaveV1V2BreakdownMethodology },
  },
  'aave-v2': {
    config: {
      [CHAIN.ETHEREUM]: {
        start: '2020-12-01',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9',
            dataProvider: '0x057835ad21a177dbdd3090bb1cae03eacf78fc6d',
          },
        ],
      },
      [CHAIN.POLYGON]: {
        start: '2021-04-01',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf',
            dataProvider: '0x7551b5d2763519d4e37e8b81929d336de671d46d',
          },
        ],
      },
      [CHAIN.AVAX]: {
        start: '2021-09-21',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0x4f01aed16d97e3ab5ab2b501154dc9bb0f1a5a2c',
            dataProvider: '0x65285e9dfab318f57051ab2b139cccf232945451',
          },
        ],
      },
    },
    global: { methodology: aaveV1V2Methodology, breakdownMethodology: aaveV1V2BreakdownMethodology },
  },
  'yei-finance': {
    config: {
      [CHAIN.SEI]: {
        start: '2024-06-03',
        pools: [
          {
            version: 3,
            ignoreFlashloan: true,
            ignoreLiquidation: true,
            lendingPoolProxy: '0x4a4d9abd36f923cba0af62a39c01dec2944fb638',
            dataProvider: '0x60c82a40c57736a9c692c42e87a8849fb407f0d6',
          },
        ],
      },
    },
  },
  'zerolend': {
    config: {
      [CHAIN.ETHEREUM]: {
        start: '2024-03-04',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x3bc3d34c32cc98bf098d832364df8a222bbab4c0',
            dataProvider: '0x47223d4ea966a93b2cc96ffb4d42c22651fadfcf',
          },
          {
            version: 3,
            lendingPoolProxy: '0xCD2b31071119D7eA449a9D211AC8eBF7Ee97F987',
            dataProvider: '0x31063F7CA8ef4089Db0dEdf8D6e35690B468A611',
          },
          {
            version: 3,
            lendingPoolProxy: '0xD3a4DA66EC15a001466F324FA08037f3272BDbE8',
            dataProvider: '0x298ECDcb0369Aef75cBbdA3e46a224Cfe622E287',
          },
        ],
      },
      [CHAIN.BLAST]: {
        start: '2024-03-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xa70b0f3c2470abbe104bdb3f3aaa9c7c54bea7a8',
            dataProvider: '0xc6df4dddbfacb866e78dcc01b813a41c15a08c10',
          },
        ],
      },
      [CHAIN.LINEA]: {
        start: '2024-03-10',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2f9bb73a8e98793e26cb2f6c4ad037bdf1c6b269',
            dataProvider: '0x67f93d36792c49a4493652b91ad4bd59f428ad15',
          },
          {
            version: 3,
            lendingPoolProxy: '0xc6ff96AefD1cC757d56e1E8Dcc4633dD7AA5222D',
            dataProvider: '0x9aFB91a3cfB9aBc8Cbc8429aB57b6593FE36E173',
          },
        ],
      },
      [CHAIN.ERA]: {
        start: '2023-07-17',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x4d9429246ea989c9cee203b43f6d1c7d83e3b8f8',
            dataProvider: '0xb73550bc1393207960a385fc8b34790e5133175e',
          },
        ],
      },
      [CHAIN.MANTA]: {
        start: '2024-01-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2f9bb73a8e98793e26cb2f6c4ad037bdf1c6b269',
            dataProvider: '0x67f93d36792c49a4493652b91ad4bd59f428ad15',
          },
        ],
      },
      [CHAIN.BASE]: {
        start: '2024-09-24',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x766f21277087E18967c1b10bF602d8Fe56d0c671',
            dataProvider: '0xA754b2f1535287957933db6e2AEE2b2FE6f38588',
          },
        ],
      },
      [CHAIN.ZIRCUIT]: {
        start: '2024-09-05',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2774C8B95CaB474D0d21943d83b9322Fb1cE9cF5',
            dataProvider: '0xA754b2f1535287957933db6e2AEE2b2FE6f38588',
          },
        ],
      },
      [CHAIN.CORN]: {
        start: '2024-12-11',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x927b3A8e5068840C9758b0b88207b28aeeb7a3fd',
            dataProvider: '0x2f7e54ff5d45f77bFfa11f2aee67bD7621Eb8a93',
          },
        ],
      },
      [CHAIN.BERACHAIN]: {
        start: '2025-02-11',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xE96Feed449e1E5442937812f97dB63874Cd7aB84',
            dataProvider: '0x26416E170aDb35B0d23800602cf98853dBDeB74F',
          },
        ],
      },
      [CHAIN.ABSTRACT]: {
        start: '2025-05-14',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x7C4baE19949D77B7259Dc4A898e64DC5c2d10b02',
            dataProvider: '0x8EEAE4dD40EBee7Bb6471c47d4d867539CF53ccF',
          },
        ],
      },
      [CHAIN.HEMI]: {
        start: '2025-03-12',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xdB7e029394a7cdbE27aBdAAf4D15e78baC34d6E8',
            dataProvider: '0x9698FdF843cbe4531610aC231B0047d9FFc13bC6',
          },
        ],
      },
    },
  },
  'tokos-fi': {
    config: {
      [CHAIN.SOMNIA]: {
        start: '2025-09-11',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xEC6758e6324c167DB39B6908036240460a2b0168',
            dataProvider: '0x6A8c1d9ff923B75D662Ee839E4AD8949279bAF10',
          },
        ],
      },
    },
  },
  'tydro': {
    config: {
      [CHAIN.INK]: {
        start: '2025-10-13',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA',
            dataProvider: '0x96086C25d13943C80Ff9a19791a40Df6aFC08328',
          },
        ],
      },
    },
  },
  'neverland': {
    config: {
      [CHAIN.MONAD]: {
        start: '2025-11-23',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x80F00661b13CC5F6ccd3885bE7b4C9c67545D585',
            dataProvider: '0xfd0b6b6F736376F7B99ee989c749007c7757fDba',
          },
        ],
      },
    },
    global: {
      methodology: {
        Fees: 'Interest paid by borrowers, flashloan fees, and liquidation fees.',
        Revenue: 'Portion of fees going to Neverland protocol. veDUST holders vote to distribute 100% of revenue among: veDUST holder rewards, LP staking incentives, or DUST buybacks.',
        SupplySideRevenue: 'Portion of interest distributed to lenders.',
        ProtocolRevenue: 'Portion of fees going to Neverland protocol. veDUST holders vote to distribute 100% of revenue among: veDUST holder rewards, LP staking incentives, or DUST buybacks.',
      },
    },
  },
  'hypurrfi': {
    config: {
      [CHAIN.HYPERLIQUID]: {
        start: '2025-02-20',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xcecce0eb9dd2ef7996e01e25dd70e461f918a14b',
            dataProvider: '0x895c799a5bbdcb63b80bee5bd94e7b9138d977d6',
            selfLoanAssets: {
              '0xca79db4b49f608ef54a5cb813fbed3a6387bc645': 'USDXL',
            },
          },
        ],
      },
    },
    global: {
      methodology: {
        Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
        Revenue: 'Amount of fees go to HypurrFi treasury.',
        SupplySideRevenue: 'Amount of fees distributed to suppliers.',
        ProtocolRevenue: 'Amount of fees go to HypurrFi treasury.',
      },
      breakdownMethodology: {
        Fees: {
          [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets (excluding USDXL).',
          'Borrow Interest USDXL': 'All interest paid by borrowers from USDXL only.',
          [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses.',
          [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors.',
        },
        Revenue: {
          [METRIC.BORROW_INTEREST]: 'A portion of interest paid by borrowers from all markets (excluding USDXL).',
          'Borrow Interest USDXL': 'All 100% interest paid by USDXL borrowers.',
          [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses.',
          [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors.',
        },
        SupplySideRevenue: {
          [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets (excluding USDXL).',
          'Borrow Interest USDXL': 'No supply side revenue for lenders on USDXL market.',
          [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses are distributed to lenders.',
          [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
        },
        ProtocolRevenue: {
          [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets (excluding USDXL) are collected by HypurrFi treasury.',
          'Borrow Interest USDXL': 'All interest paid on USDXL market are collected by HypurrFi treasury.',
          [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses are colected by HypurrFi treasury.',
          [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors are collected by HypurrFi treasury.',
        },
      },
    },
  },
  'spark': {
    config: {
      [CHAIN.ETHEREUM]: {
        start: '2023-03-08',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xc13e21b648a5ee794902342038ff3adab66be987',
            dataProvider: '0xfc21d6d146e6086b8359705c8b28512a983db0cb',
          },
        ],
      },
      [CHAIN.XDAI]: {
        start: '2023-09-06',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2dae5307c5e3fd1cf5a72cb6f698f915860607e0',
            dataProvider: '0x2a002054a06546bb5a264d57a81347e23af91d18',
          },
        ],
      },
    },
    global: {
      methodology: {
        Fees: 'Include borrow interest, flashloan fee, liquidation fee and penalty paid by borrowers.',
        Revenue: 'Amount of fees go to Spark treasury.',
        SupplySideRevenue: 'Amount of fees distributed to suppliers.',
        ProtocolRevenue: 'Amount of fees go to Spark treasury.',
      },
      breakdownMethodology: {
        Fees: {
          [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers from all markets.',
          [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses.',
          [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors.',
        },
        Revenue: {
          [METRIC.BORROW_INTEREST]: 'A portion of interest paid by borrowers from all markets.',
          [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses.',
          [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors.',
        },
        SupplySideRevenue: {
          [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets.',
          [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalty and bonuses are distributed to lenders.',
          [METRIC.FLASHLOAN_FEES]: 'Flashloan fees paid by flashloan borrowers and executors are distributed to lenders.',
        },
        ProtocolRevenue: {
          [METRIC.BORROW_INTEREST]: 'Amount of interest distributed to lenders from all markets are collected by Spark treasury.',
          [METRIC.LIQUIDATION_FEES]: 'A portion of fees from liquidation penalty and bonuses are colected by Spark treasury.',
          [METRIC.FLASHLOAN_FEES]: 'A portion of fees paid by flashloan borrowers and executors are collected by Spark treasury.',
        },
      },
    },
  },
  'avalon': {
    config: {
      [CHAIN.MERLIN]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xea5c99a3cca5f95ef6870a1b989755f67b6b1939',
            dataProvider: '0x5f314b36412765f3e1016632fd1ad528929536ca',
          },
          {
            version: 3,
            lendingPoolProxy: '0x155d50D9c1D589631eA4E2eaD744CE82622AD9D3',
            dataProvider: '0x623700Fee1dF64088f258e2c4DAB4D6aEac4dDA6',
          },
          {
            version: 3,
            lendingPoolProxy: '0xdCB0FAA822B99B87E630BF47399C5a0bF3C642cf',
            dataProvider: '0x883cb2E2d9c5D4D9aF5b0d37fc39Fa2284405682',
          },
        ],
      },
      [CHAIN.BITLAYER]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xEA5c99A3cca5f95Ef6870A1B989755f67B6B1939',
            dataProvider: '0x5F314b36412765f3E1016632fD1Ad528929536CA',
          },
          {
            version: 3,
            lendingPoolProxy: '0xeD6d6d18F20f8b419B5442C43D3e48EE568dEc14',
            dataProvider: '0x4c25c261Fe47bC216113D140BaF72B05E151bcE4',
          },
          {
            version: 3,
            lendingPoolProxy: '0xC486115C7db399F0e080A3713BF01B65CC8A5b64',
            dataProvider: '0x898D0EF6E20B7597728AEB41169c22608Fe4b234',
          },
          {
            version: 3,
            lendingPoolProxy: '0xeD6d6d18F20f8b419B5442C43D3e48EE568dEc14',
            dataProvider: '0x4c25c261Fe47bC216113D140BaF72B05E151bcE4',
          },
        ],
      },
      [CHAIN.CORE]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x67197de79b2a8fc301bab591c78ae5430b9704fd',
            dataProvider: '0x802cb61844325dc9a161bc3a498e3be1b7b6fe00',
          },
          {
            version: 3,
            lendingPoolProxy: '0x2f3552CE2F071B642Deeae5c84eD2EEe3Ed08D43',
            dataProvider: '0x5c78EbB34cC5b52146D107365A66E37a677Fcf50',
          },
          {
            version: 3,
            lendingPoolProxy: '0x7f6f0e50dB09C49027314103aa5a8F6Db862dBd0',
            dataProvider: '0x2752237ccC6aB5e4B9e9BFca57D7a6956aF4FE3d',
          },
        ],
      },
      [CHAIN.BSC]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xf9278c7c4aefac4ddfd0d496f7a1c39ca6bca6d4',
            dataProvider: '0x672b19dda450120c505214d149ee7f7b6ded8c39',
          },
          {
            version: 3,
            lendingPoolProxy: '0x77fF9B0cdbb6039b9D42d92d7289110E6CCD3890',
            dataProvider: '0x9515dC23bBE46f9C9885D24Fa276745A11b7f9D8',
          },
          {
            version: 3,
            lendingPoolProxy: '0xeCaC6332e2De19e8c8e6Cd905cb134E980F18cC4',
            dataProvider: '0x58c937fa2D147117dB43d187f9411151edfFf03c',
          },
          {
            version: 3,
            lendingPoolProxy: '0x795Ae4Bd3B63aA8657a7CC2b3e45Fb0F7c9ED9Cc',
            dataProvider: '0xF828A73cB00072843241C6294ed778F26854fe5C',
          },
          {
            version: 3,
            lendingPoolProxy: '0x05C194eE95370ED803B1526f26EFd98C79078ab5',
            dataProvider: '0x56F817eF5D1945E0772496020ff0F72c3984B351',
          },
          {
            version: 3,
            lendingPoolProxy: '0x6935B1196426586b527c8D13Ce42ff12eEc2A5fC',
            dataProvider: '0xA34F1a928024E3609C8968fEA90C747e8D1fA20f',
          },
          {
            version: 3,
            lendingPoolProxy: '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D',
            dataProvider: '0x2c4aEB7C9f0D196a51136B3c7bec49cB2DBD1966',
          },
          {
            version: 3,
            lendingPoolProxy: '0x390166389f5D30281B9bDE086805eb3c9A10F46F',
            dataProvider: '0x5b9b3C211B81627Cc6b46824CB26829F31A587dc',
          },
          {
            version: 3,
            lendingPoolProxy: '0x54925C6dDeB73A962B3C3A21B10732eD5548e43a',
            dataProvider: '0x5157f63bE7808DEB090Eee7762e917745896A09E',
          },
        ],
      },
      [CHAIN.TAIKO]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xA7f1c55530B1651665C15d8104663B3f03E3386f',
            dataProvider: '0x43248dF19B9B55f7b488CF68A1224308Af2D81eC',
          },
          {
            version: 3,
            lendingPoolProxy: '0x9dd29AA2BD662E6b569524ba00C55be39e7B00fB',
            dataProvider: '0xF6Aa54a5b60c324602C9359E8221423793e5205d',
          },
        ],
      },
      [CHAIN.SONIC]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x6CCE1BC3fe54C9B1915e5f01ee076E4c4C3Cdd19',
            dataProvider: '0x28350E38f241d7F24106CE5eaB1684D6ebEB4700',
          },
          {
            version: 3,
            lendingPoolProxy: '0x974E2B16ddbF0ae6F78b4534353c2871213f2Dc9',
            dataProvider: '0x23f02C2eeFe2010298Ab74059393326d3df59a02',
          },
        ],
      },
      [CHAIN.BOB]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x35B3F1BFe7cbE1e95A3DC2Ad054eB6f0D4c879b6',
            dataProvider: '0xfabb0fDca4348d5A40EB1BB74AEa86A1C4eAd7E2',
          },
          {
            version: 3,
            lendingPoolProxy: '0x6d8fE6EAa893860aA1B877A8cA4f0A6cbd4249f7',
            dataProvider: '0x100AC26ad2c253B18375f1dC4BC0EeeB66DEBc88',
          },
          {
            version: 3,
            lendingPoolProxy: '0x99a05a9210B2861ccED5db7696eED3f4D73EB70c',
            dataProvider: '0x28292e1ca36e400FB7d0B66AaA99EB808E3Cb8cB',
          },
        ],
      },
      [CHAIN.ARBITRUM]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xe1ee45db12ac98d16f1342a03c93673d74527b55',
            dataProvider: '0xec579d2ce07401258710199ff12a5bb56e086a6f',
          },
          {
            version: 3,
            lendingPoolProxy: '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D',
            dataProvider: '0x2c4aEB7C9f0D196a51136B3c7bec49cB2DBD1966',
          },
        ],
      },
      [CHAIN.ETHEREUM]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x35B3F1BFe7cbE1e95A3DC2Ad054eB6f0D4c879b6',
            dataProvider: '0xfabb0fDca4348d5A40EB1BB74AEa86A1C4eAd7E2',
          },
          {
            version: 3,
            lendingPoolProxy: '0x1c8091b280650aFc454939450699ECAA67C902d9',
            dataProvider: '0x2eE0438BCC1876cEA2c6fc43dD21417cF3D1c2eF',
          },
          {
            version: 3,
            lendingPoolProxy: '0xE0E468687703dD02BEFfB0BE13cFB109529F38e0',
            dataProvider: '0x87Ed94868f6fbaA834Db81a1C5854c445caCaB67',
          },
        ],
      },
      [CHAIN.MODE]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x7454E4ACC4B7294F740e33B81224f50C28C29301',
            dataProvider: '0xC5b05b7092257Ee3eEAf013198d30F1E8179B6C9',
          },
          {
            version: 3,
            lendingPoolProxy: '0x2c373aAB54b547Be9b182e795bed34cF9955dc34',
            dataProvider: '0x8F016F5dac399F20B34E35CBaF1dFf12eeE2dE74',
          },
        ],
      },
      [CHAIN.BSQUARED]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xC0843a5A8527FD7221256893D4a4305145937E8c',
            dataProvider: '0x4Ea93E846b8C6E7b3D5a5BEDF4fe6B8AED58FCEe',
          },
        ],
      },
      [CHAIN.BASE]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x6374a1F384737bcCCcD8fAE13064C18F7C8392e5',
            dataProvider: '0xA9D15C669940a757Ab76C6604f2f8f1e198f7D50',
          },
        ],
      },
      [CHAIN.SCROLL]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xA90FB5234A659b7e5738775F8B48f8f833b3451C',
            dataProvider: '0x18cbe70602Ee17f79D56971F685E9EaF49DA53F2',
          },
        ],
      },
      [CHAIN.IOTEX]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x29ee512b76f58ff4d281c49c7d1b6b248c79f009',
            dataProvider: '0xBa77520d38953BF6a8395D118CfF714Ed672533f',
          },
          {
            version: 3,
            lendingPoolProxy: '0x99a05a9210B2861ccED5db7696eED3f4D73EB70c',
            dataProvider: '0x28292e1ca36e400FB7d0B66AaA99EB808E3Cb8cB',
          },
          {
            version: 3,
            lendingPoolProxy: '0x4B801fb6f0830D070f40aff9ADFC8f6939Cc1F8D',
            dataProvider: '0x2c4aEB7C9f0D196a51136B3c7bec49cB2DBD1966',
          },
        ],
      },
      [CHAIN.KLAYTN]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xCf1af042f2A071DF60a64ed4BdC9c7deE40780Be',
            dataProvider: '0xddD3D480521bc027596e078BCd1b838d50Daa076',
          },
          {
            version: 3,
            lendingPoolProxy: '0x4659F938458afB37F3340270FC9CdFe665809c1b',
            dataProvider: '0x276c5119f63119921667842dA3B71EE10Ac486eA',
          },
        ],
      },
      [CHAIN.ZETA]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x6935B1196426586b527c8D13Ce42ff12eEc2A5fC',
            dataProvider: '0xA34F1a928024E3609C8968fEA90C747e8D1fA20f',
          },
          {
            version: 3,
            lendingPoolProxy: '0x7454E4ACC4B7294F740e33B81224f50C28C29301',
            dataProvider: '0xC5b05b7092257Ee3eEAf013198d30F1E8179B6C9',
          },
        ],
      },
      [CHAIN.CORN]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xd412D77A4920317ffb3F5deBAD29B1662FBA53DF',
            dataProvider: '0x56552f4407113894Bfce34b5b88C57b941AFc519',
          },
          {
            version: 3,
            lendingPoolProxy: '0xd63C731c8fBC672B69257f70C47BD8e82C9efBb8',
            dataProvider: '0xf0d077728D424Ee6C6Eba82d23ce56C2e91E57Ea',
          },
          {
            version: 3,
            lendingPoolProxy: '0xdef0EB584700Fc81C73ACcd555cB6cea5FB85C3e',
            dataProvider: '0x867885c1dB3020E25A86Db7e20E35dC7b81d76A2',
          },
          {
            version: 3,
            lendingPoolProxy: '0xC1bFbF4E0AdCA79790bfa0A557E4080F05e2B438',
            dataProvider: '0x5EcDC2432ED77cD8E2cE6183712c5cc712c40ec0',
          },
        ],
      },
      [CHAIN.DUCKCHAIN]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x6d8fE6EAa893860aA1B877A8cA4f0A6cbd4249f7',
            dataProvider: '0x100AC26ad2c253B18375f1dC4BC0EeeB66DEBc88',
          },
          {
            version: 3,
            lendingPoolProxy: '0xbA41c92B8FE13f806974cd9fd3F285B0b8b44495',
            dataProvider: '0x912b425D867a09608A884C83b3D5075E9037Aa6a',
          },
        ],
      },
      [CHAIN.SEI]: {
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xE5eB6aBbA365A49C8624532acaed54A47cc36D3C',
            dataProvider: '0x16b9b88B773C1a1aBA6D305e0560171405d45121',
          },
        ],
      },
    },
  },
  'colend-protocol': {
    config: {
      [CHAIN.CORE]: {
        start: '2024-04-16',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x0cea9f0f49f30d376390e480ba32f903b43b19c5',
            dataProvider: '0x567af83d912c85c7a66d093e41d92676fa9076e3',
          },
        ],
      },
    },
  },
  'extra-finance-xlend': {
    config: {
      [CHAIN.OPTIMISM]: {
        start: '2024-11-07',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x345D2827f36621b02B783f7D5004B4a2fec00186',
            dataProvider: '0xCC61E9470B5f0CE21a3F6255c73032B47AaeA9C0',
          },
        ],
      },
      [CHAIN.BASE]: {
        start: '2024-03-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x09b11746DFD1b5a8325e30943F8B3D5000922E03',
            dataProvider: '0x1566DA4640b6a0b32fF309b07b8df6Ade40fd98D',
          },
        ],
      },
    },
  },
  'hyperlend': {
    config: {
      [CHAIN.HYPERLIQUID]: {
        start: '2025-03-22',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b',
            dataProvider: '0x5481bf8d3946E6A3168640c1D7523eB59F055a29',
          },
        ],
      },
    },
  },
  'hyperyield': {
    config: {
      [CHAIN.HYPERLIQUID]: {
        start: '2025-03-04',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x8Cc02b048deA40d8D0D13eac9866F5bb42D3F4E9',
            dataProvider: '0xf8b130AaF759C24d91BeC7Dd64e4A82D2CF51194',
          },
          {
            version: 3,
            lendingPoolProxy: '0xC0Fd3F8e8b0334077c9f342671be6f1a53001F12',
            dataProvider: '0x022f164ddba35a994ad0f001705e9c187156e244',
          },
        ],
      },
    },
  },
  'kinza-finance': {
    config: {
      [CHAIN.BSC]: {
        start: '2023-09-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xcb0620b181140e57d1c0d8b724cde623ca963c8c',
            dataProvider: '0x09ddc4ae826601b0f9671b9edffdf75e7e6f5d61',
          },
        ],
      },
      [CHAIN.OP_BNB]: {
        start: '2023-10-12',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x3Aadc38eBAbD6919Fbd00C118Ae6808CBfE441CB',
            dataProvider: '0xBb5f2d30c0fC9B0f71f7B19DaF19e7Cf3D23eb5E',
          },
        ],
      },
      [CHAIN.ETHEREUM]: {
        start: '2024-03-26',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xeA14474946C59Dee1F103aD517132B3F19Cef1bE',
            dataProvider: '0xE44990a8a732605Eddc0870597d2Cf4A2637F038',
          },
        ],
      },
      [CHAIN.MANTLE]: {
        start: '2024-05-117',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x5757b15f60331eF3eDb11b16ab0ae72aE678Ed51',
            dataProvider: '0x18cc2c55b429EE08748951bBD33FF2e68c95ec38',
          },
        ],
      },
    },
  },
  'lava': {
    config: {
      [CHAIN.ARBITRUM]: {
        start: '2024-04-02',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0x3Ff516B89ea72585af520B64285ECa5E4a0A8986',
            dataProvider: '0x8Cb093763cD2EB1e418eaEFfFC4f20c1665304a2',
          },
        ],
      },
    },
  },
  'lendle': {
    config: {
      [CHAIN.MANTLE]: {
        start: '2022-03-20',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0xCFa5aE7c2CE8Fadc6426C1ff872cA45378Fb7cF3',
            dataProvider: '0x552b9e4bae485C4B7F540777d7D25614CdB84773',
          },
        ],
      },
    },
  },
  'more-markets': {
    config: {
      [CHAIN.FLOW]: {
        start: '2025-01-14',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xbC92aaC2DBBF42215248B5688eB3D3d2b32F2c8d',
            dataProvider: '0x79e71e3c0EDF2B88b0aB38E9A1eF0F6a230e56bf',
          },
        ],
      },
    },
  },
  'pac-finance': {
    config: {
      [CHAIN.BLAST]: {
        start: '2024-03-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xd2499b3c8611E36ca89A70Fda2A72C49eE19eAa8',
            dataProvider: '0x742316f430002D067dC273469236D0F3670bE446',
          },
        ],
      },
    },
  },
  'realt-rmm-marketplace-v2': {
    config: {
      [CHAIN.XDAI]: {
        start: '2024-01-23',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xFb9b496519fCa8473fba1af0850B6B8F476BFdB3',
            dataProvider: '0x11B45acC19656c6C52f93d8034912083AC7Dd756',
          },
        ],
      },
    },
  },
  'realt-rmm-marketplace': {
    config: {
      [CHAIN.XDAI]: {
        start: '2022-01-22',
        pools: [
          {
            version: 2,
            lendingPoolProxy: '0x5B8D36De471880Ee21936f328AAB2383a280CB2A',
            dataProvider: '0x8956488Dc17ceA7cBEC19388aEbDB37273F523BE',
          },
        ],
      },
    },
  },
  'sakefinance': {
    config: {
      [CHAIN.SONEIUM]: {
        start: '2025-01-09',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x3C3987A310ee13F7B8cBBe21D97D4436ba5E4B5f',
            dataProvider: '0x2BECa16DAa6Decf9C6F85eBA8F0B35696A3200b3',
          },
          {
            version: 3,
            lendingPoolProxy: '0x0Bd12d3C4E794cf9919618E2bC71Bdd0C4FF1cF6',
            dataProvider: '0x3b5FDb25672A0ea560E66905B97d0c818a00f5eb',
          },
        ],
      },
    },
  },
  'seamless-v1': {
    config: {
      [CHAIN.BASE]: {
        start: '2023-09-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7',
            dataProvider: '0x2A0979257105834789bC6b9E1B00446DFbA8dFBa',
          },
        ],
      },
    },
  },
  'superlend': {
    config: {
      [CHAIN.ETHERLINK]: {
        start: '2024-10-04',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x3bD16D195786fb2F509f2E2D7F69920262EF114D',
            dataProvider: '0x99e8269dDD5c7Af0F1B3973A591b47E8E001BCac',
          },
        ],
      },
    },
  },
  'unleash-protocol': {
    config: {
      [CHAIN.STORY]: {
        start: '2025-02-13',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xC62Af8aa9E2358884B6e522900F91d3c924e1b38',
            dataProvider: '0x970C24ABaEA0dddf1b1C328237001c74Bb96c9e4',
          },
        ],
      },
    },
  },
  'vicuna-lending': {
    config: {
      [CHAIN.SONIC]: {
        start: '2025-02-07',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xaa1C02a83362BcE106dFf6eB65282fE8B97A1665',
            dataProvider: '0xc67850eCd0EC9dB4c0fD65C1Ad43a53025e6d54D',
          },
          {
            version: 3,
            lendingPoolProxy: '0x220fc1bEcC9bbE1a9dD81795F0505cC36E1B2563',
            dataProvider: '0xe78536507675de30D375C6d2B5dA1a99819Ea9fa',
          },
          {
            version: 3,
            lendingPoolProxy: '0x3C7FEA4d4c3EbBf19E73b6C99CE4B8884B87Bfa6',
            dataProvider: '0x94e8122dF227B34998Ba7523ad88c943191cF4F1',
          },
        ],
      },
    },
  },
}

const aaveProtocols = Object.fromEntries(
  Object.entries(aaveProtocolConfigs).map(([name, { config, global }]) => [name, aaveAdapter(config, global)])
)

export const { protocolList, getAdapter } = createFactoryExports(aaveProtocols)