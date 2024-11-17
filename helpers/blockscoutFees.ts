import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { httpGet } from '../utils/fetchURL';
import { CHAIN } from "./chains";

export function blockscoutFeeAdapter(chain: string, url: string, CGToken?: string) {
  const adapter: Adapter = {
    version: 1,
    adapter: {
      [chain]: {
        fetch: async (_timestamp: number, _: ChainBlocks, { createBalances, startOfDay, }: FetchOptions) => {
          const dailyFees = createBalances()
          const date = new Date(startOfDay * 1000).toISOString().slice(0, "2011-10-05".length)
          const fees = await httpGet(`${url}&date=${date}`)
          if (chain == CHAIN.CANTO && CGToken) dailyFees.addCGToken(CGToken, fees.gas_used_today * fees.gas_prices.average /1e18)
          else if (CGToken) dailyFees.addCGToken(CGToken, fees.result/1e18)
          else dailyFees.addGasToken(fees.result)

          return {
            timestamp: startOfDay, dailyFees,
          };
        },
        start: '2019-12-01'
      },
    },
    protocolType: ProtocolType.CHAIN
  }

  return adapter
}
