import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { formatAddress } from "../../utils/utils";
import { addOneToken } from "../prices";
import { CurveContractAbis, getAllPools, ICurveDexConfig, getPoolTokens, ITokenExchangeEvent, ContractVersion } from "./helpers";

// export types and helpers
export * from "./helpers";

export async function getCurveDexData(options: FetchOptions, config: ICurveDexConfig) {
  const dailyVolume = options.createBalances()
  const swapFees = options.createBalances()
  const adminFees = options.createBalances()

  const tokenExchangeEvents: Array<ITokenExchangeEvent> = []
  const tokenExchangeUnderlyingEvents: Array<ITokenExchangeEvent> = []
  const uniquePoolAddresses: {[key: string]: boolean} = {}

  const allPools = await getAllPools(options, config)

  // get swap logs
  for (const [version, pools] of Object.entries(allPools)) {
    if (pools.length > 0) {
      const swapLogs = await options.getLogs({
        targets: pools,
        eventAbi: CurveContractAbis[version].TokenExchange,
        flatten: true,
        onlyArgs: false,
      });
  
      for (const log of swapLogs) {
        uniquePoolAddresses[formatAddress(log.address)] = true
        tokenExchangeEvents.push({
          pool: formatAddress(log.address),
          tx: log.transactionHash,
          sold_id: Number(log.args.sold_id),
          tokens_sold: Number(log.args.tokens_sold),
          bought_id: Number(log.args.bought_id),
          tokens_bought: Number(log.args.tokens_bought),
        })
      }

      if (version === ContractVersion.main || version === ContractVersion.stable_factory) {
        const underlyingSwapLogs = await options.getLogs({
          targets: pools,
          eventAbi: CurveContractAbis[version].TokenExchangeUnderlying,
          flatten: true,
          onlyArgs: false,
        });
        for (const log of underlyingSwapLogs) {
          uniquePoolAddresses[formatAddress(log.address)] = true
          tokenExchangeUnderlyingEvents.push({
            pool: formatAddress(log.address),
            tx: log.transactionHash,
            sold_id: Number(log.args.sold_id),
            tokens_sold: Number(log.args.tokens_sold),
            bought_id: Number(log.args.bought_id),
            tokens_bought: Number(log.args.tokens_bought),
          })
        }
      }
    }
  }

  const pools = await getPoolTokens(options, Object.keys(uniquePoolAddresses), config)

  for (const event of tokenExchangeEvents) {
    const token0 = pools[event.pool].tokens[event.sold_id]
    const token1 = pools[event.pool].tokens[event.bought_id]
    const feeRate = pools[event.pool].feeRate
    const adminFeeRate = pools[event.pool].adminFeeRate
    const amount0 = Number(event.tokens_sold)
    const amount1 = Number(event.tokens_bought)

    if (!token0 && !token1) continue
  
    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    addOneToken({ chain: options.chain, balances: swapFees, token0, token1, amount0: amount0 * feeRate, amount1: amount1 * feeRate })
    addOneToken({ chain: options.chain, balances: adminFees, token0, token1, amount0: amount0 * feeRate * adminFeeRate, amount1: amount1 * feeRate * adminFeeRate })
  }

  for (const event of tokenExchangeUnderlyingEvents) {
    const token0 = pools[event.pool].underlyingTokens[event.sold_id]
    const token1 = pools[event.pool].underlyingTokens[event.bought_id]
    const feeRate = pools[event.pool].feeRate
    const adminFeeRate = pools[event.pool].adminFeeRate
    const amount0 = Number(event.tokens_sold)
    const amount1 = Number(event.tokens_bought)

    // why we only add token with index of 0 here?
    //
    // meta pools have coins in order of token, basepool LP token
    // for example of FEI - DAI/USDC/USDT pool, FEI has index of 0 and DAI/USDC/USDT LP token has index of 1
    //
    // on TokenExchangeUnderlying events, contracts put amount of LP token are being traded instead of underlying token amount, so, we cannot get correct amount of underlying token
    // for example,
    //  when users swap USDC for FEI, contracts takes USDC and add liquidity to DAI/USDC/USDT and get an amount of LP token
    //  contracts put this LP amount into TokenExchangeUnderlying event, so we can not get correct trae amount from USDC amount, we only can get trade amount from FEI amount
    if (event.sold_id === 0) {
      if (token0) {
        dailyVolume.add(token0, amount0);
        swapFees.add(token0, amount0 * feeRate);
        adminFees.add(token0, amount0 * feeRate * adminFeeRate);
      }
    } else if (event.bought_id === 0) {
      if (token1) {
        dailyVolume.add(token1, amount1);
        swapFees.add(token1, amount1 * feeRate);
        adminFees.add(token1, amount1 * feeRate * adminFeeRate);
      }
    }
  }

  return { dailyVolume, swapFees, adminFees }
}

interface FeeSplitConfigs {
  userFeesRatio: number; // how many percentage from swap fees, 0.5 -> 50%
  revenueRatio: number; // how many percentage of swap fees, 0.5 -> 50%
  holdersRevenueRatio: number; // how many percentage of swap fees, 0.5 -> 50%
}

export function getCurveExport(configs: {[key: string]: ICurveDexConfig}, feeSplitConfig: FeeSplitConfigs | undefined = undefined) {
  const adapter: SimpleAdapter = {
    version: 2,
    adapter: Object.keys(configs).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: async function(options: FetchOptions) {
            const { dailyVolume, swapFees, adminFees } = await getCurveDexData(options, configs[chain])
            const swapFeesExcludeAdminFees = swapFees.clone()
            swapFeesExcludeAdminFees.subtract(adminFees)
            if (feeSplitConfig) {
              return {
                dailyVolume,
                dailyFees: swapFees,
                dailyUserFees: swapFees.clone(feeSplitConfig.userFeesRatio),
                dailyRevenue: swapFeesExcludeAdminFees.clone(feeSplitConfig.revenueRatio),
                dailyProtocolRevenue: adminFees,
                dailySupplySideRevenue: swapFeesExcludeAdminFees.clone(1 - feeSplitConfig.revenueRatio),
                dailyHoldersRevenue: swapFeesExcludeAdminFees.clone(feeSplitConfig.holdersRevenueRatio),
              }
            } else {
              return { dailyVolume, dailyFees: swapFees, dailyRevenue: adminFees, dailyProtocolRevenue: adminFees };
            }
          },
          start: configs[chain].start,
        }
      }
    }, {})
  };

  return adapter;
}
