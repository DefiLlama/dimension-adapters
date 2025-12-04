import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const ADDRESS_TRADING_USDC = '0x3556d16519e3407AD43d5d7b3011bB095553d77a';

// Constants from contract
const DENOMINATOR = BigInt(10 ** 18);

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

  // Process Open Events
  openLogs.forEach((log: any) => {
    const orderId = log.orderId.toString();
    const margin = BigInt(log.t.base.margin);
    const leverage = BigInt(log.t.base.leverage);
    leverageByOrder.set(orderId, leverage);

    const fee = BigInt(log.fee);
    const size = margin * leverage / DENOMINATOR;

    dailyVolume.addUSDValue(size);
    // Fee is in USD already
    dailyFees.addUSDValue(fee);
  });

  // Process Close Events
  closeLogs.forEach((log: any) => {
    const orderId = log.orderId.toString();
    const closeMargin = BigInt(log._closeMargin);
    const rolloverFee = BigInt(log.rolloverFee);
    const closeFee = BigInt(log.closeFee);

    // Get leverage from Open event (if available)
    const leverage = leverageByOrder.get(orderId);

    if (leverage) {
      const size = closeMargin * BigInt(leverage) / BigInt(DENOMINATOR);
      dailyVolume.addUSDValue(size);
    } else {
      console.warn("unknown orderId for event Close", orderId);
    }

    const totalCloseFees = rolloverFee + closeFee;
    dailyFees.addUSDValue(totalCloseFees);
  });

  return {
    dailyVolume,
    dailyFees,
    timestamp: options.startOfDay,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
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
