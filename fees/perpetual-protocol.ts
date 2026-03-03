import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const address = '0x82ac2ce43e33683c58be4cdc40975e73aa50f459';
const event_postion_change = 'event PositionChanged(address indexed trader,address indexed baseToken,int256 exchangedPositionSize,int256 exchangedPositionNotional,uint256 fee,int256 openNotional,int256 realizedPnl,uint256 sqrtPriceAfterX96)';

const fetchFees = async ({ createBalances, getLogs, }: FetchOptions) => {
  const logs = await getLogs({ target: address, eventAbi: event_postion_change })
  const dailyFees = createBalances()

  logs.map((e: any) => { dailyFees.addUSDValue(Number(e.fee) / 10 ** 18) })

  const dailyRevenue = dailyFees.clone(0.2)
  const dailySupplySideRevenue = dailyFees.clone(0.8)
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, }
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees,
      start: '2023-01-01'
    }
  }
}
export default adapters;
