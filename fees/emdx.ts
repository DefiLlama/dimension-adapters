import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const address = '0xbfb083840b0507670b92456264164e5fecd0430b';

const fetch = async ({ createBalances, getLogs, }: FetchOptions) => {
  const dailyFees = await createBalances();

  const logs = (await getLogs({
    target: address,
    eventAbi: 'event PositionChanged (address indexed trader, address indexed amm, uint256 margin, uint256 positionNotional, int256 exchangedPositionSize, uint256 fee, int256 positionSizeAfter, int256 realizedPnl, int256 unrealizedPnlAfter, uint256 badDebt, uint256 liquidationPenalty, uint256 spotPrice, int256 fundingPayment)'
  }))
  logs.forEach((tx: any) => {
    const fee = Number(tx.fee) / 10 ** 18;
    dailyFees.addUSDValue(fee);
  })
  return { dailyFees, };
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch,
      start: '2022-05-21'
    },
  }
}

export default adapter;
