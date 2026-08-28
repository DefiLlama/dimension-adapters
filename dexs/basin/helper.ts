import { BaseAdapterChainConfig, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addOneToken } from "../../helpers/prices";

export interface BasinExchangeConfig {
  wells: string[];
  start: string; // YYYY-MM-DD
}

export interface BasinExchangeExportConfig {
  [chain: string]: BasinExchangeConfig;
}

async function getBasinVolume(options: FetchOptions, configs: BasinExchangeExportConfig) {
  const config = configs[options.chain];
  const dailyVolume = options.createBalances();

  const wellsSwapEvents = await options.getLogs({
    eventAbi: 'event Swap(address fromToken, address toToken, uint256 amountIn, uint256 amountOut, address recipient)',
    targets: config.wells,
    flatten: true,
  });

  for (const event of wellsSwapEvents) {
    addOneToken({
      chain: options.chain,
      balances: dailyVolume,
      token0: event.fromToken,
      token1: event.toToken,
      amount0: event.amountIn,
      amount1: event.amountOut,
    });
  }

  return { dailyVolume };
}

export function getBasinAdapter(configs: BasinExchangeExportConfig): SimpleAdapter {
  const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    methodology: { Volume: 'Total swap volume from all Well pools on exchange.' },
    adapter: {},
  };

  for (const [chain, config] of Object.entries(configs)) {
    (adapter.adapter as BaseAdapterChainConfig)[chain] = {
      fetch: (options: FetchOptions) => getBasinVolume(options, configs),
      start: config.start,
    };
  }

  return adapter;
}
