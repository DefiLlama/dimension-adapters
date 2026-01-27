import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from '../helpers/token';

const LIT = '0xfd0205066521550d7d7ab19da8f72bb004b4c341';
const OLIT_TOKEN = '0x627fee87d0D9D2c55098A06ac805Db8F98B158Aa';

const fetch = () => {
  return async (timestamp: number, _: ChainBlocks, options: FetchOptions): Promise<FetchResultFees> => {

    const dailyFees = await addTokensReceived({ options, tokens: [OLIT_TOKEN], target: '0x37aeB332D6E57112f1BFE36923a7ee670Ee9278b', tokenTransform: () => LIT })
    dailyFees.resizeBy(0.5)
    const dailyRevenue = dailyFees.clone()
    dailyRevenue.resizeBy(0.25)
    const dailyHoldersRevenue = dailyFees.clone()
    dailyHoldersRevenue.resizeBy(0.03)
    const dailySupplySideRevenue = dailyFees.clone()
    dailySupplySideRevenue.resizeBy(0.75)
    return {
      timestamp,
      dailyFees,
      dailyRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
      dailyHoldersRevenue: dailyHoldersRevenue,
    } as FetchResultFees
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(),
      start: '2023-08-30',
    },
  },
  methodology: {
    Fees: "Liquidity management fees paid by users",
    Revenue: "25% liquidity management fees paid by users",
    HoldersRevenue: "30% share of revenue to token holders",
    SupplySideRevenue: "75% fees share to liquidity providers",
  }

}

export default adapter;