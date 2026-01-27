import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

async function fetch({ createBalances, getLogs }: FetchOptions) {
  const dailyVolume = createBalances();
  const boughtLogs = await getLogs({
    target: '0xeb554444b5c49bab7781b1cfc0e3be211053c6d7',
    eventAbi: 'event Bought (address indexed fromAsset, address indexed toAsset, uint256 amountSold, uint256 receivedAmount)',
  });
  boughtLogs.forEach(log => {
    const amountSold = log.amountSold.toString() * 100 / 99
    dailyVolume.addGasToken(amountSold)
  })

  const soldLogs = await getLogs({
    target: '0xeb554444b5c49bab7781b1cfc0e3be211053c6d7',
    eventAbi: 'event Sold (address indexed operator, address indexed to, uint256 indexed id, uint256 amount)',
  });
  soldLogs.forEach(log => {
    const amountSold = log.amount.toString() * 1.01
    dailyVolume.addGasToken(amountSold)
  })

  const dailyFees = dailyVolume.clone(1 / 100) // 1% of transaction volume is collected as fees
  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

export default {
  version: 2,
  start: '2025-08-17',
  adapter: {
    [CHAIN.XLAYER]: {
      fetch,
      start: '2025-08-17',
    },
  },
}