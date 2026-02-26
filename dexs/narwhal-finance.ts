import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import BigNumber from 'bignumber.js';

const ADDRESS_TRADING_USDC = '0x3556d16519e3407AD43d5d7b3011bB095553d77a';

// Constants from contract
const DENOMINATOR = BigNumber(10 ** 18);
const USDC_DECIMALS = BigNumber(1e6);

// Event definitions based on the contract
// OpenTrade struct: { base: TradeBase, openPrice, lastUpdateTime }
// TradeBase struct: { trader, pairIndex, margin, long, leverage, tp, sl }
const openEventAbi = 'event Open(uint256 orderId, ((address trader, uint256 pairIndex, uint256 margin, bool long, uint256 leverage, uint256 tp, uint256 sl) base, uint256 openPrice, uint256 lastUpdateTime) t, uint256 fee)';
const closeEventAbi = 'event Close(uint256 orderId, uint256 closePrice, uint256 _closeMargin, int256 fundingFee, uint256 rolloverFee, uint256 closeFee, uint256 afterFee, uint8 s)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  const [openLogs, closeLogs] = await Promise.all([
    options.getLogs({
      target: ADDRESS_TRADING_USDC,
      eventAbi: openEventAbi,
    }),
    options.getLogs({
      target: ADDRESS_TRADING_USDC,
      eventAbi: closeEventAbi,
    }),
  ]);

  const leverageByOrder = new Map();

  openLogs.forEach((log: any) => {
    const orderId = log.orderId.toString();
    const margin = BigNumber(log.t.base.margin);
    const leverage = BigNumber(log.t.base.leverage);
    leverageByOrder.set(orderId, leverage);

    const fee = BigNumber(log.fee);
    const feeUSD = fee.dividedBy(USDC_DECIMALS);
    const size = margin.multipliedBy(leverage).dividedBy(DENOMINATOR);
    const sizeUSD = size.dividedBy(USDC_DECIMALS);

    dailyVolume.addUSDValue(sizeUSD.toNumber());
    dailyFees.addUSDValue(feeUSD.toNumber());
  });

  closeLogs.forEach((log: any) => {
    const orderId = log.orderId.toString();
    const closeMargin = BigNumber(log._closeMargin);
    const rolloverFee = BigNumber(log.rolloverFee);
    const closeFee = BigNumber(log.closeFee);

    const leverage = leverageByOrder.get(orderId);

    if (leverage) {
      const size = closeMargin.multipliedBy(leverage).dividedBy(DENOMINATOR);
      const sizeUSD = size.dividedBy(USDC_DECIMALS);
      dailyVolume.addUSDValue(sizeUSD.toNumber());
    } else {
      console.warn("unknown orderId for event Close", orderId);
    }

    const totalCloseFees = rolloverFee.plus(closeFee);
    const totalCloseFeeUSD = totalCloseFees.dividedBy(USDC_DECIMALS);
    dailyFees.addUSDValue(totalCloseFeeUSD.toNumber());
  });

  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-11-11',
    },
  },
  methodology: {
    Volume: 'Volume is calculated by summing the notional position sizes: (margin * leverage) for both Open and Close events',
    Fees: 'Fees include: (1) Open fees from Open events, (2) Close fees, rollover fees, and positive funding fees from Close events. All fees are in USDC.',
  },
};

export default adapter;
