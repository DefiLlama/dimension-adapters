import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchVolume = async ({ getLogs }: FetchOptions): Promise<FetchResultVolume> => {
  let volume = 0

  const logs = await getLogs({
    target: "0x994B9a6c85E89c42Ea7cC14D42afdf2eA68b72F1",
    eventAbi: 'event CreateOrder( address indexed account, bytes32 indexed orderId, tuple(address account, bytes32 orderId, uint256 amount, uint256 fee, bytes32 quote_currency, uint256 delivery_type, uint256 position_type, uint256 quantity, uint256 delivery, uint256 strike_price, uint256 sheet, uint256 created_at) params)',
  })


  logs.forEach(({ params: log }: any) => {
    //quantity*strike_price*sheet
    const orderVolume = log.quantity.toString() * log.strike_price.toString() * log.sheet.toString() / 1e18
    volume += orderVolume
  })

  return {
    dailyVolume: volume / 1e18,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume,
      start: '2024-04-23',
    },
  },
};

export default adapter;
