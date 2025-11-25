import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const LEVERUP_DIAMOND = '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec';

const LVUSD = '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1';
const LVMON = '0x91b81bfbe3A747230F0529Aa28d8b2Bc898E6D56';

const USDC_MAINNET = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'; // Monad USDC
const WMON_MAINNET = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A'; // Monad MON

// Open Trade Event
const openMarketTradeAbi =
  'event OpenMarketTrade(address indexed user, bytes32 indexed tradeHash, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';
// Close Trade Events
const closeTradeSuccessfulV2Abi =
  'event CloseTradeSuccessfulV2(address indexed user, bytes32 indexed tradeHash, (uint128 closePrice, int96 fundingFee, uint96 closeFee, int96 pnl, uint96 holdingFee) closeInfo, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';
const executeCloseSuccessfulV2Abi =
  'event ExecuteCloseSuccessfulV2(address indexed user, bytes32 indexed tradeHash, uint8 executionType, (uint128 closePrice, int96 fundingFee, uint96 closeFee, int96 pnl, uint96 holdingFee) closeInfo, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';

// Token identification events
const closeTradeReceivedAbi =
  'event CloseTradeReceived(address indexed user, bytes32 indexed tradeHash, address indexed token, uint256 amount)';
const closeTradeAddLiquidityAbi = 'event CloseTradeAddLiquidity(address indexed token, uint256 amount)';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Fetch all relevant logs
  const [
    openLogs,
    closeLogs,
    executeLogs,
    // receivedLogs and liquidityLogs are no longer strictly needed for token mapping if ot.lvToken provides it directly!
    // But let's check if 'ot' struct in V2 events has lvToken. YES it does.
    // "address lvToken" is in the struct.
    // So we can simplify greatly! We don't need tradeTokenMap anymore.
  ] = await Promise.all([
    options.getLogs({ target: LEVERUP_DIAMOND, eventAbi: openMarketTradeAbi }),
    options.getLogs({ target: LEVERUP_DIAMOND, eventAbi: closeTradeSuccessfulV2Abi }),
    options.getLogs({ target: LEVERUP_DIAMOND, eventAbi: executeCloseSuccessfulV2Abi }),
  ]);

  const addFee = (token: string, amount: bigint) => {
    if (token.toLowerCase() === LVUSD.toLowerCase()) {
      // Convert 18 decimals to 6 decimals for USDC
      const feeUSDC = amount / BigInt(1e12);
      dailyFees.add(USDC_MAINNET, feeUSDC);
    } else if (token.toLowerCase() === LVMON.toLowerCase()) {
      // Assuming LVMON is 18 decimals, same as WMON/WETH
      dailyFees.add(WMON_MAINNET, amount);
    }
  };

  // 1. Process Open Fees
  openLogs.forEach((log: any) => {
    const lvToken = log.ot.lvToken;
    const openFee = BigInt(log.ot.lvOpenFee);
    const execFee = BigInt(log.ot.lvExecutionFee);
    addFee(lvToken, openFee + execFee);
  });

  // 2. Process Close Fees directly from V2 events
  const processCloseLog = (log: any) => {
    const lvToken = log.ot.lvToken; // Available directly in V2 event

    const closeFee = BigInt(log.closeInfo.closeFee);
    const holdingFee = BigInt(log.closeInfo.holdingFee);
    const fundingFee = BigInt(log.closeInfo.fundingFee); // int96

    let totalFee = closeFee + holdingFee;
    if (fundingFee < 0n) {
      totalFee += -fundingFee;
    }

    if (totalFee > 0n) {
      addFee(lvToken, totalFee);
    }
  };

  closeLogs.forEach(processCloseLog);
  executeLogs.forEach(processCloseLog);

  return {
    dailyFees,
    timestamp: options.startOfDay,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-11-23',
};

export default adapter;
