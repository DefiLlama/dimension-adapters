import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

const ADDRESS_TRADING_USDC = '0x3556d16519e3407AD43d5d7b3011bB095553d77a';
const ADDRESS_USDC_MONAD = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'; // Monad USDC

// Constants from contract
const LEV_DENOMINATOR = 10; // Leverage is stored as x10 (10x leverage = 100)

// Event definitions based on the contract
// OpenTrade struct: { base: TradeBase, openPrice, lastUpdateTime }
// TradeBase struct: { trader, pairIndex, margin, long, leverage, tp, sl }
const openEventAbi = 'event Open(uint256 orderId, ((address trader, uint256 pairIndex, uint256 margin, bool long, uint256 leverage, uint256 tp, uint256 sl) base, uint256 openPrice, uint256 lastUpdateTime) t, uint256 fee)';

const closeEventAbi = 'event Close(uint256 orderId, uint256 closePrice, uint256 _closeMargin, int256 fundingFee, uint256 rolloverFee, uint256 closeFee, uint256 afterFee, uint8 s)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  let dailyVolume = 0;

  // Map to store leverage by orderId for Close event processing
  const leverageByOrder = new Map<string, number>();

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

  // Process Open Events
  openLogs.forEach((log: any) => {
    const orderId = log.orderId.toString();
    const margin = BigInt(log.t.base.margin);
    const leverage = BigInt(log.t.base.leverage);
    const fee = BigInt(log.fee);

    // Store leverage for this order (will be used in Close events)
    leverageByOrder.set(orderId, Number(leverage));

    // Volume calculation: position = (margin * leverage) / LEV_DENOMINATOR
    // Contract: position = (base.margin * base.leverage) / LEV_DENOMINATOR
    // Result is in USDC (6 decimals), so we convert to USD
    const position = margin * leverage / BigInt(LEV_DENOMINATOR);
    const volumeUSD = Number(position) / 1e6;
    dailyVolume += volumeUSD;

    // Fee is in USDC (6 decimals)
    dailyFees.add(ADDRESS_USDC_MONAD, fee);
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
      // Calculate close position: closePosition = (closeMargin * leverage) / LEV_DENOMINATOR
      const closePosition = closeMargin * BigInt(leverage) / BigInt(LEV_DENOMINATOR);
      const volumeUSD = Number(closePosition) / 1e6;
      dailyVolume += volumeUSD;
    } else {
      // Fallback: estimate with 10x average leverage if we don't have the data
      // This can happen if the position was opened before our tracking started
      const estimatedLeverage = 100; // 10x in contract terms
      const closePosition = closeMargin * BigInt(estimatedLeverage) / BigInt(LEV_DENOMINATOR);
      const volumeUSD = Number(closePosition) / 1e6;
      dailyVolume += volumeUSD;
    }

    // Close fee and rollover fee are always collected
    let totalCloseFees = rolloverFee + closeFee;

    // Add fees in USDC (6 decimals)
    dailyFees.add(ADDRESS_USDC_MONAD, totalCloseFees);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    timestamp: options.startOfDay,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-12-01',
    },
  },
  methodology: {
    Volume: 'Volume is calculated by summing the notional position sizes: (margin * leverage) / 10 for both Open and Close events. Leverage is stored as x10 in the contract (e.g., 10x leverage = 100).',
    Fees: 'Fees include: (1) Open fees from Open events, (2) Close fees, rollover fees, and positive funding fees from Close events. All fees are in USDC.',
    UserFees: 'All fees are paid by users/traders.',
  },
};

export default adapter;
