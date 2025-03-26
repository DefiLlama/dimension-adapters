import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import * as sdk from "@defillama/sdk";
import AaveAbis from './abi';
import { Interface } from 'ethers';
import { normalizeAddress } from '@defillama/sdk/build/util';

export interface AaveLendingPoolConfig {
  version: 2 | 3;
  lendingPoolProxy: string;
  dataProvider: string;
}

interface ReserveDataUpdatedEvent {
  transactionHash: any;
  reserve: string;
  blockNumber: number;
  liquidityIndex: bigint;
}

// PercentageMath uses 4 decimals: https://etherscan.io/address/0x02d84abd89ee9db409572f19b6e1596c301f3c81#code#F17#L15
const ReserveFactorDecimals = BigInt(1e4);

// https://etherscan.io/address/0x02d84abd89ee9db409572f19b6e1596c301f3c81#code#F16#L16
const LiquidityIndexDecimals = BigInt(1e27);

async function getPoolFees(pool: AaveLendingPoolConfig, options: FetchOptions): Promise<{
  dailyFees: sdk.Balances,
  dailyRevenue: sdk.Balances,
}> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  // get reserve (token) list which are supported by lthe ending pool
  const reservesList: Array<string> = await options.api.call({ target: pool.lendingPoolProxy, abi: AaveAbis.getReservesList })

  // get reserves configs, mainly reserveFactor values
  const reserveConfigs = await options.api.multiCall({
    abi: AaveAbis.getReserveConfiguration,
    calls: reservesList.map(
      (reserveAddress: string) => {
        return {
          target: pool.dataProvider,
          params: [reserveAddress],
        }
    })
  })

  // map reserve with their reserveFactor rate
  const reserveFactors: {[key: string]: bigint} = {}
  for (let i = 0; i < reservesList.length; i++) {
    reserveFactors[normalizeAddress(reservesList[i])] = BigInt(reserveConfigs[i][4])
  }

  // query ReservedataUpdated events from lending pool proxy
  const lendingPoolContract: Interface = new Interface([
    AaveAbis.reserveDataUpdatedEvent,
  ])
  const events: Array<ReserveDataUpdatedEvent> = (await options.getLogs({
    target: pool.lendingPoolProxy,
    flatten: false,
    entireLog: true,
    topic: '0x804c9b842b2748a22bb64b345453a3de7ca54a6ca45ce00d415894979e22897a',
  }))
  .map((log: any) => {
    const decodeLog: any = lendingPoolContract.parseLog(log);

    const event: ReserveDataUpdatedEvent = {
      transactionHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      reserve: normalizeAddress(decodeLog.args[0]),
      liquidityIndex: BigInt(decodeLog.args[4].toString()),
    }

    return event
  })
  .flat()

  for (const event of events) {
    const reserveData = await options.api.call({
      abi: pool.version === 3 ? AaveAbis.getReserveDataV3 : AaveAbis.getReserveDataV2,
      target: pool.dataProvider,
      params: [event.reserve],
      skipCache: true,
      permitFailure: false,
      block: event.blockNumber,
    })

    let liquidityIndex = BigInt(0)
    let totalLiquidity = BigInt(0)
    if (pool.version === 3) {
      liquidityIndex = BigInt(reserveData[9].toString())
      totalLiquidity = BigInt(reserveData[2].toString())
    } else {
      liquidityIndex = BigInt(reserveData[7].toString())
      totalLiquidity = BigInt(reserveData[0].toString()) + BigInt(reserveData[1].toString()) + BigInt(reserveData[2].toString())
    }

    const growthLiquidityIndex = event.liquidityIndex - liquidityIndex
    const interestAccrued = totalLiquidity * growthLiquidityIndex / LiquidityIndexDecimals
    const revenueAccrued = reserveFactors[event.reserve] * interestAccrued / ReserveFactorDecimals

    dailyFees.add(event.reserve, interestAccrued.toString())
    dailyRevenue.add(event.reserve, revenueAccrued.toString())
  }

  return {
    dailyFees,
    dailyRevenue,
  }
}

export function aaveExport(config: IJSON<Array<AaveLendingPoolConfig>>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, pools]) => {
    exportObject[chain] = {
      fetch: (async (options: FetchOptions) => {
        const totalDailyFees = options.createBalances()
        const totalDailyRevenue = options.createBalances()
        const totalDailyHoldersRevenue = options.createBalances()
        const totalDailySupplySideRevenue = options.createBalances()

        for (const pool of pools) {
          const { dailyFees, dailyRevenue } = await getPoolFees(pool, options)

          totalDailyFees.addBalances(dailyFees)
          totalDailyRevenue.addBalances(dailyRevenue)
          totalDailySupplySideRevenue.addBalances(dailyFees)
          totalDailyHoldersRevenue.addBalances(dailyRevenue)

          Object.entries(dailyRevenue.getBalances()).forEach(([token, balance]) => {
            totalDailySupplySideRevenue.addTokenVannila(token, Number(balance) * -1)
          })
        }
        
        return { dailyFees: totalDailyFees, dailyRevenue: totalDailyRevenue, dailyHoldersRevenue: totalDailyHoldersRevenue, dailySupplySideRevenue: totalDailySupplySideRevenue }
      }) ,
    }
  })
  return { adapter: exportObject, version: 2 } as SimpleAdapter
}