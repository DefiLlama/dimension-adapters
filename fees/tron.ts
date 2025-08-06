import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const adapter: Adapter = {
  adapter: {
    [CHAIN.TRON]: {
      fetch: async (timestamp: number, _: ChainBlocks, { createBalances, startOfDay }: FetchOptions) => {
        const dailyFees = createBalances()
        const ts = startOfDay
        const today = new Date(ts * 1000).toISOString().substring(0, "2022-11-03".length)
        const _dailyFees = await httpGet(`https://apilist.tronscanapi.com/api/turnover?size=1000&start=1575158400000&end=${Date.now()}&type=0`);
        const trxFeesToday = _dailyFees.data.find((d: any) => d.day === today)
        dailyFees.addCGToken('tron', trxFeesToday.total_trx_burn)

        return {
          timestamp,
          dailyFees,
          dailyRevenue: dailyFees,
          dailyHoldersRevenue: dailyFees,
        };
      },
      start: '2019-12-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Gas fees paid by users.',
    Revenue: 'Amount of TRX fees were burned.',
    HoldersRevenue: 'Amount of TRX fees were burned.',
  }
}

export default adapter;
