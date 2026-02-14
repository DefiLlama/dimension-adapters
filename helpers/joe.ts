import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter, IStartTimestamp } from "../adapters/types";
import { formatAddress } from "../utils/utils";
import { addOneToken } from "./prices";
import { METRIC } from "./metrics";

type FactoryVersion = 2 | 2.1 | 2.2;

interface IFactory {
  factory: string;
  version: FactoryVersion;
  fromBlock: number;
}

interface IPair {
  factory: string;
  version: FactoryVersion;
  tokenX: string;
  tokenY: string;
  protocolFeeShare: number;
}

interface ExportConfig {
  [key: string]: {
    factories: Array<IFactory>;
    start?: IStartTimestamp | number | string;
  }
}

interface ExportFeesConfig {
  protocolRevenueFromRevenue?: number;
  holdersRevenueFromRevenue?: number;
}

const Abis = {
  LBPairCreatedEvent: 'event LBPairCreated(address indexed tokenX, address indexed tokenY, uint256 indexed binStep, address LBPair, uint256 pid)',
  SwapEvent: 'event Swap(address indexed sender, address indexed recipient, uint256 indexed id, bool swapForY, uint256 amountIn, uint256 amountOut, uint256 volatilityAccumulated, uint256 fees)',
  SwapEventV21: 'event Swap(address indexed sender, address indexed to, uint24 id, bytes32 amountsIn, bytes32 amountsOut, uint24 volatilityAccumulator, bytes32 totalFees, bytes32 protocolFees)',
  feeParameters: 'function feeParameters() view returns (uint16 binStep, uint16 baseFactor, uint16 filterPeriod, uint16 decayPeriod, uint16 reductionFactor, uint24 variableFeeControl, uint16 protocolShare, uint24 maxVolatilityAccumulated, uint24 volatilityAccumulated, uint24 volatilityReference, uint24 indexRef, uint40 time)',
}

function getAmountsFromBytesString(bytes: string): {amountX: number, amountY: number} {
  return {
    amountX: parseInt(`0x${bytes.replace('0x', '').slice(32, 64)}`, 16),
    amountY: parseInt(`0x${bytes.replace('0x', '').slice(0, 32)}`, 16),
  }
}

function getFetch(exportConfig: ExportConfig, feesConfig?: ExportFeesConfig): FetchV2 {
  async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyVolume = options.createBalances()
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()

    for (const factory of exportConfig[options.chain].factories) {
      const lpPairCreatedEvents = await options.getLogs({
        target: factory.factory,
        eventAbi: Abis.LBPairCreatedEvent,
        fromBlock: factory.fromBlock,
        cacheInCloud: true,
      })

      const feeParameters = factory.version === 2 ? await options.api.multiCall({
        abi: Abis.feeParameters,
        calls: lpPairCreatedEvents.map(event => event.LBPair),
        permitFailure: true,
      }) : [];

      const pairs: {[key: string]: IPair} = {}
      for (let i = 0; i < lpPairCreatedEvents.length; i++) {
        const event = lpPairCreatedEvents[i]
        const feeParameter = feeParameters[i]
        pairs[formatAddress(event.LBPair)] = {
          factory: formatAddress(factory.factory),
          version: factory.version,
          tokenX: formatAddress(event.tokenX),
          tokenY: formatAddress(event.tokenY),
          protocolFeeShare: feeParameter ? feeParameter.protocolShare / 1e4 : 0,
        }
      }

      if (Object.keys(pairs).length > 0) {
        const swapEvents = await options.getLogs({
          targets: Object.keys(pairs),
          eventAbi: factory.version === 2 ? Abis.SwapEvent : Abis.SwapEventV21,
          flatten: true,
          onlyArgs: false,
        })
        for (const swapEvent of swapEvents) {
          const pairAddress = formatAddress(swapEvent.address)

          if (factory.version === 2) {
            const tokenIn = swapEvent.args.swapForY ? pairs[pairAddress].tokenX : pairs[pairAddress].tokenY
            const tokenOut = swapEvent.args.swapForY ? pairs[pairAddress].tokenY : pairs[pairAddress].tokenX
            const amountIn = swapEvent.args.amountIn
            const amountOut = swapEvent.args.amountOut

            // fees charged on tokenX
            const fees = swapEvent.args.fees

            // add core asset amount to volume
            addOneToken({ balances: dailyVolume, chain: options.chain, token0: tokenIn, token1: tokenOut, amount0: amountIn + fees, amount1: amountOut })

            dailyFees.add(tokenIn, fees, METRIC.SWAP_FEES)
            if (pairs[pairAddress].protocolFeeShare) {
              dailyRevenue.add(tokenIn, fees * pairs[pairAddress].protocolFeeShare, METRIC.PROTOCOL_FEES)
            }
          } else {
            const { amountX: amountInX, amountY: amountInY } = getAmountsFromBytesString(swapEvent.args.amountsIn)
            const { amountX: amountOutX, amountY: amountOutY } = getAmountsFromBytesString(swapEvent.args.amountsOut)
            const { amountX: totalFeesX, amountY: totalFeesY } = getAmountsFromBytesString(swapEvent.args.totalFees)
            const { amountX: protocolFeesX, amountY: protocolFeesY } = getAmountsFromBytesString(swapEvent.args.protocolFees)

            addOneToken({ balances: dailyVolume, chain: options.chain, token0: pairs[pairAddress].tokenX, token1: pairs[pairAddress].tokenY, amount0: amountInX, amount1: amountInY })
            addOneToken({ balances: dailyVolume, chain: options.chain, token0: pairs[pairAddress].tokenX, token1: pairs[pairAddress].tokenY, amount0: amountOutX, amount1: amountOutY })

            dailyFees.add(pairs[pairAddress].tokenX, totalFeesX, METRIC.SWAP_FEES)
            dailyFees.add(pairs[pairAddress].tokenY, totalFeesY, METRIC.SWAP_FEES)
            dailyRevenue.add(pairs[pairAddress].tokenX, protocolFeesX, METRIC.PROTOCOL_FEES)
            dailyRevenue.add(pairs[pairAddress].tokenY, protocolFeesY, METRIC.PROTOCOL_FEES)
          }
        }
      }
    }

    const dailySupplySideRevenue = options.createBalances()
    const tempBalance = dailyFees.clone(1)
    tempBalance.subtract(dailyRevenue)
    dailySupplySideRevenue.addBalances(tempBalance, METRIC.LP_FEES)

    const dailyProtocolRevenue = feesConfig && feesConfig.protocolRevenueFromRevenue ? dailyRevenue.clone(feesConfig.protocolRevenueFromRevenue) : undefined;
    const dailyHoldersRevenue = feesConfig && feesConfig.holdersRevenueFromRevenue ? dailyRevenue.clone(feesConfig.holdersRevenueFromRevenue) : undefined;

    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue,
      dailyRevenue,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
    }
  }

  return fetch;
}

export function joeLiquidityBookExport(config: ExportConfig, feesConfig?: ExportFeesConfig): SimpleAdapter {
  const adapter: SimpleAdapter = {
    version: 2,
    adapter: {},
  }

  for (const chain of Object.keys(config)) {
    const chainConfig = config[chain];
    const adapterConfig: any = {
      fetch: getFetch(config, feesConfig)
    };
    
    if (chainConfig.start !== undefined) {
      adapterConfig.start = chainConfig.start;
    }
    
    (adapter.adapter as any)[chain] = adapterConfig;
  }

  return adapter;
}
