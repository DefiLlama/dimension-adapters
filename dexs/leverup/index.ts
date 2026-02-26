import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const LEVERUP_DIAMOND = '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec';

const LVUSD = '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1';
const LVMON = '0x91b81bfbe3A747230F0529Aa28d8b2Bc898E6D56';

const USDC_MAINNET = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'; // Monad USDC
const WMON_MAINNET = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A'; // Monad MON

const openMarketTradeAbi =
  'event OpenMarketTrade(address indexed user, bytes32 indexed tradeHash, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';
const closeTradeSuccessfulV2Abi =
  'event CloseTradeSuccessfulV2(address indexed user, bytes32 indexed tradeHash, (uint128 closePrice, int96 fundingFee, uint96 closeFee, int96 pnl, uint96 holdingFee) closeInfo, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';
const executeCloseSuccessfulV2Abi =
  'event ExecuteCloseSuccessfulV2(address indexed user, bytes32 indexed tradeHash, uint8 executionType, (uint128 closePrice, int96 fundingFee, uint96 closeFee, int96 pnl, uint96 holdingFee) closeInfo, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';


const fetch = async (options: FetchOptions) => {
  // We calculate volume in USD directly
  let dailyVolume = 0;
  // Use createBalances for accurate fee calculation across multiple tokens
  const dailyFees = options.createBalances();

  const [openLogs, closeLogs, executeLogs] = await Promise.all([
    options.getLogs({
      target: LEVERUP_DIAMOND,
      eventAbi: openMarketTradeAbi,
    }),
    options.getLogs({
      target: LEVERUP_DIAMOND,
      eventAbi: closeTradeSuccessfulV2Abi,
    }),
    options.getLogs({
      target: LEVERUP_DIAMOND,
      eventAbi: executeCloseSuccessfulV2Abi,
    }),
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

  // 1. Process Open Events
  openLogs.forEach((log: any) => {
    // qty is 1e10 precision, entryPrice is 1e18 precision.
    // Total precision is 1e28.
    // We want USD volume (1e0).
    // Convert to number carefully.
    const qty = parseFloat(log.ot.qty);
    const entryPrice = parseFloat(log.ot.entryPrice);

    const lvToken = log.ot.lvToken;
    // Use BigInt for fees to match fees adapter logic and maintain precision before adding to balances
    const openFee = BigInt(log.ot.lvOpenFee);
    const execFee = BigInt(log.ot.lvExecutionFee);

    // Volume = (qty * price) / 1e28
    dailyVolume += (qty * entryPrice) / 1e28;

    // Add fees using the helper
    addFee(lvToken, openFee + execFee);
  });

  // 2. Process Close Events
  const processCloseLog = (log: any) => {
    const qty = parseFloat(log.ot.qty);
    // Use closePrice for volume calculation on close? Or entryPrice?
    // Usually volume is notional value. On close, notional is also qty * closePrice.
    const closePrice = parseFloat(log.closeInfo.closePrice);

    dailyVolume += (qty * closePrice) / 1e28;

    const lvToken = log.ot.lvToken;
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
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-11-23',
  methodology: {
    Volume: 'Volume is calculated by summing the notional value (qty * entryPrice) of all OpenMarketTrade events.',
    Fees: 'Fees are calculated by summing the open fees, execution fees, close fees, holding fees, and user-paid funding fees.',
  },
};

export default adapter;
