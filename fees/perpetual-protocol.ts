import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const address = '0x82ac2ce43e33683c58be4cdc40975e73aa50f459';
const event_postion_change = 'event PositionChanged(address indexed trader,address indexed baseToken,int256 exchangedPositionSize,int256 exchangedPositionNotional,uint256 fee,int256 openNotional,int256 realizedPnl,uint256 sqrtPriceAfterX96)';

const fetchFees = async ({ createBalances, getLogs, }: FetchOptions) => {
  const logs = await getLogs({ target: address, eventAbi: event_postion_change })
  const dailyFees = createBalances()

  logs.map((e: any) => { dailyFees.addUSDValue(Number(e.fee) / 10 ** 18, METRIC.TRADING_FEES) })

  const dailyRevenue = dailyFees.clone(0.2, METRIC.PROTOCOL_FEES)
  const dailySupplySideRevenue = dailyFees.clone(0.8, METRIC.LP_FEES)
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, }
}

const methodology = {
  UserFees: "Traders pay fees on position changes (opening, closing, or modifying positions)",
  Fees: "All trading fees collected from perpetual contract position changes",
  Revenue: "20% of trading fees allocated to the protocol treasury",
  SupplySideRevenue: "80% of trading fees distributed to liquidity providers and vaults"
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Fees paid by traders on all position changes including opening, closing, and modifying perpetual positions"
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "20% of trading fees retained by the protocol treasury"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "80% of trading fees distributed to liquidity providers who supply capital to trading vaults"
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees,
      start: '2023-01-01'
    }
  },
  methodology,
  breakdownMethodology
}
export default adapters;
