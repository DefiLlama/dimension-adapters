import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpGet, httpPost } from "../utils/fetchURL";

const adapter: Adapter = {
  adapter: {
    [CHAIN.TRON]: {
      fetch: async (timestamp: number, _: ChainBlocks, { createBalances, startOfDay }: FetchOptions) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const dailyHoldersRevenue = createBalances()
        const today = new Date(startOfDay * 1000).toISOString().substring(0, "2022-11-03".length)

        // Tron prices Energy and Bandwidth in SUN (1 TRX = 1e6 SUN). Users pay
        // for resource consumption by direct TRX burn, by staking TRX to
        // receive Energy/Bandwidth, or via rental markets — every path settles
        // at these same on-chain rates, so multiplying resources consumed by
        // the current network fee rate captures the full user fee burden.
        const chainParams = await httpPost(
          "https://api.trongrid.io/wallet/getchainparameters",
          {},
        )
        const paramsByKey = Object.fromEntries(
          chainParams.chainParameter.map((p: any) => [p.key, p.value]),
        )
        const energyFeeSun = Number(paramsByKey.getEnergyFee)
        const bandwidthFeeSun = Number(paramsByKey.getTransactionFee)

        const overview = await httpGet(
          `https://apilist.tronscanapi.com/api/stats/overview?days=30`,
        )
        const dayOverview = overview.data.find((d: any) => d.dateDayStr === today)
        if (!dayOverview) throw new Error(`No Tron overview data for ${today}`)

        const turnover = await httpGet(
          `https://apilist.tronscanapi.com/api/turnover?size=1000&start=1575158400000&end=${Date.now()}&type=0`,
        )
        const dayTurnover = turnover.data.find((d: any) => d.day === today)
        if (!dayTurnover) throw new Error(`No Tron turnover data for ${today}`)

        const energyFeeTrx = (Number(dayOverview.energy_usage) * energyFeeSun) / 1e6
        const bandwidthFeeTrx = (Number(dayOverview.net_usage) * bandwidthFeeSun) / 1e6

        dailyFees.addCGToken('tron', energyFeeTrx, METRIC.TRANSACTION_GAS_FEES)
        dailyFees.addCGToken('tron', bandwidthFeeTrx, METRIC.TRANSACTION_GAS_FEES)

        // TRX burned for Energy/Bandwidth is the share the network captures
        // (destroyed from supply = deflationary to TRX holders). The remainder
        // of the fee burden is paid via staked TRX or rental markets and
        // accrues to private stakers, not the network or holders broadly.
        const burnedTrx = Number(dayTurnover.total_trx_burn)
        dailyRevenue.addCGToken('tron', burnedTrx, METRIC.TRANSACTION_GAS_FEES)
        dailyHoldersRevenue.addCGToken('tron', burnedTrx, METRIC.TRANSACTION_GAS_FEES)

        return {
          timestamp,
          dailyFees,
          dailyRevenue,
          dailyHoldersRevenue,
        };
      },
      start: '2019-12-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users — Energy and Bandwidth resources consumed, priced at the current on-chain fee rates (getEnergyFee, getTransactionFee). Fees can be paid by burning TRX directly, by staking TRX, or via rental markets; all paths settle at the same network rate.',
    Revenue: 'TRX burned by the network for Energy and Bandwidth payments (deflationary to TRX holders).',
    HoldersRevenue: 'TRX burned by the network for Energy and Bandwidth payments (deflationary to TRX holders).',
  }
}

export default adapter;
