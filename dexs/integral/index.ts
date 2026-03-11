import * as sdk from "@defillama/sdk";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import {
  DEFAULT_DAILY_VOLUME_FIELD,
} from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

export const chains = [
  CHAIN.ARBITRUM,
  CHAIN.ETHEREUM,
];
export const endpoints = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('ANd5QJuYtyfngmXvBMu9kZAv935vhcqp4xAGBkmCADN3'),
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('HXeVedRK7VgogXwbK5Sc4mjyLkhBAS5akskRvbSYnkHU'),
};
export const factories = {
  [CHAIN.ETHEREUM]: '0xC480b33eE5229DE3FbDFAD1D2DCD3F3BAD0C56c6',
  [CHAIN.ARBITRUM]: '0x717EF162cf831db83c51134734A15D1EBe9E516a',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (options: FetchOptions) => {
          const adapter = getUniV2LogAdapter({ factory: factories[chain] })
          const response = await adapter(options)
          return response;
        },
        start: getStartTimestamp({
          endpoints: endpoints,
          chain,
          volumeField: DEFAULT_DAILY_VOLUME_FIELD,
          dailyDataField: "dayDatas",
        }),
      },
    };
  }, {} as BaseAdapter),
};

export default adapter;
