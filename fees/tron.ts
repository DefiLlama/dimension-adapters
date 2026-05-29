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
        const dailySupplySideRevenue = createBalances()
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
        const energyFeeRaw = paramsByKey.getEnergyFee
        const bandwidthFeeRaw = paramsByKey.getTransactionFee
        const energyFeeSun = Number(energyFeeRaw)
        const bandwidthFeeSun = Number(bandwidthFeeRaw)
        if (energyFeeRaw === undefined || !Number.isFinite(energyFeeSun) || energyFeeSun <= 0)
          throw new Error(`Tron getEnergyFee missing or invalid: ${energyFeeRaw}`)
        if (bandwidthFeeRaw === undefined || !Number.isFinite(bandwidthFeeSun) || bandwidthFeeSun <= 0)
          throw new Error(`Tron getTransactionFee missing or invalid: ${bandwidthFeeRaw}`)

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
        const totalFeesTrx = energyFeeTrx + bandwidthFeeTrx

        dailyFees.addCGToken('tron', energyFeeTrx, METRIC.TRANSACTION_GAS_FEES)
        dailyFees.addCGToken('tron', bandwidthFeeTrx, METRIC.TRANSACTION_GAS_FEES)

        // TRX burned for Energy/Bandwidth is the share the network captures
        // (destroyed from supply = deflationary to TRX holders). The remainder
        // is paid via staked TRX or rental markets and accrues to private
        // stakers — that's supply-side revenue, not protocol/holder revenue.
        const burnedTrx = Number(dayTurnover.total_trx_burn)
        dailyRevenue.addCGToken('tron', burnedTrx, METRIC.TRANSACTION_GAS_FEES)
        dailyHoldersRevenue.addCGToken('tron', burnedTrx, METRIC.TRANSACTION_GAS_FEES)

        // Energy/Bandwidth value paid via stake or rental markets (the non-burn
        // share of dailyFees) goes to TRX stakers / rental delegators rather
        // than to the network. Clamp at 0 to avoid sign noise in days where
        // reported burn marginally exceeds reconstructed resource value.
        const supplySideTrx = Math.max(0, totalFeesTrx - burnedTrx)
        dailySupplySideRevenue.addCGToken('tron', supplySideTrx, METRIC.TRANSACTION_GAS_FEES)

        return {
          timestamp,
          dailyFees,
          dailyRevenue,
          dailyHoldersRevenue,
          dailySupplySideRevenue,
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
    SupplySideRevenue: 'Energy and Bandwidth fees paid via staked TRX delegation or rental markets — accrues to TRX stakers and rental delegators rather than to the network.',
  }
}

export default adapter;
