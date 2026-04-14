import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { METRIC } from '../../helpers/metrics'

const LVMON_Redeemer = "0xF24BED91ff0a8Fc1aCec39F6851a5eBd7dCf2BF2";
const sLVMON = "0x61b29EfEf2E6f866bA4AaeFDb87d2837C6a22b9c";
const LVMON_ISSUER = "0xbF52cED429C3901AfA4BBF25849269eF7A4ad105";

const LEVERUP_DIAMOND = '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec';

const LVUSD = '0xFD44B35139Ae53FFF7d8F2A9869c503D987f00d1';
const LVMON = '0x91b81bfbe3A747230F0529Aa28d8b2Bc898E6D56';

const USDC_MAINNET = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'; // Monad USDC
const WMON_MAINNET = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A'; // Monad MON

const openMarketTradeAbi =
  'event OpenMarketTrade(address indexed user,bytes32 indexed tradeHash, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';
const closeTradeSuccessfulV2Abi =
  'event CloseTradeSuccessfulV2(address indexed user,bytes32 indexed tradeHash, (uint128 closePrice, int96 fundingFee, uint96 closeFee, int96 pnl, uint96 holdingFee) closeInfo, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';
const executeCloseSuccessfulV2Abi =
  'event ExecuteCloseSuccessfulV2(address indexed user,bytes32 indexed tradeHash, uint8 executionType, (uint128 closePrice, int96 fundingFee, uint96 closeFee, int96 pnl, uint96 holdingFee) closeInfo, (address user, uint32 userOpenTradeIndex, uint40 holdingFeeRate, uint128 entryPrice, uint128 qty, address pairBase, address tokenPay, address lvToken, uint96 lvMargin, uint128 stopLoss, uint128 takeProfit, uint24 broker, bool isLong, uint32 timestamp, uint96 lvOpenFee, uint96 lvExecutionFee, int256 longAccFundingFeePerShare, uint256 openBlock) ot)';
const interestDistributedAbi = 
  'event InterestDistributed(uint256 interest,uint256 interestFee,uint256 interestReceiverAmount)';
const redeemFeeCollectedAbi = 
  'event RedeemFeeCollected(address indexed payer,address indexed recipient,address indexed reserveToken,uint256 grossAmount,uint256 feeAmount,bool isFastRedeem)';
const sLVMONWithdrawalFeeCollectedAbi = 
  'event WithdrawalFeeCollected(address indexed owner,address indexed receiver,address indexed recipient,uint256 fee,uint256 netAssets,uint256 shares)';

const fetch = async (options: FetchOptions) => {
  // We calculate volume in USD directly
  let dailyVolume = 0;
  // Use createBalances for accurate fee calculation across multiple tokens
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances()

  const [openLogs, closeLogs, executeLogs, interestLogs, redeemLogs, withdrawalLogs] = await Promise.all([
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
    options.getLogs({
      target: LVMON_ISSUER,
      eventAbi: interestDistributedAbi,
    }),
    options.getLogs({
      target: LVMON_Redeemer,
      eventAbi: redeemFeeCollectedAbi,
    }),
    options.getLogs({
      target: sLVMON,
      eventAbi: sLVMONWithdrawalFeeCollectedAbi,
    }),
  ]);

  const addFee = (balances: ReturnType<FetchOptions['createBalances']>, token: string, amount: bigint, label: string) => {
    if (token.toLowerCase() === LVUSD.toLowerCase()) {
      // Convert 18 decimals to 6 decimals for USDC
      const feeUSDC = amount / BigInt(1e12);
      balances.add(USDC_MAINNET, feeUSDC, label);
    } else if (token.toLowerCase() === LVMON.toLowerCase()) {
      // Assuming LVMON is 18 decimals, same as WMON/WETH
      balances.add(WMON_MAINNET, amount, label);
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
    addFee(dailyFees, lvToken, openFee + execFee, METRIC.OPEN_CLOSE_FEES);
    addFee(dailyProtocolRevenue, lvToken, openFee + execFee, METRIC.OPEN_CLOSE_FEES);
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
      addFee(dailyFees, lvToken, totalFee, METRIC.OPEN_CLOSE_FEES);
      addFee(dailyProtocolRevenue, lvToken, totalFee, METRIC.OPEN_CLOSE_FEES);
    }
  };

  closeLogs.forEach(processCloseLog);
  executeLogs.forEach(processCloseLog);

  // 3. Process LVMON ecosystem fee events from new event addresses
  interestLogs.forEach((log: any) => {
    const interest = BigInt(log.interest);
    const interestFee = BigInt(log.interestFee);
    const interestSupplySide = BigInt(log.interestReceiverAmount);
    if (interest > 0n) dailyFees.add(WMON_MAINNET, interest, 'LVMON Interest');
    if (interestFee > 0n) dailyProtocolRevenue.add(WMON_MAINNET, interestFee, 'LVMON Performance Fees');
    if (interestSupplySide > 0n) dailySupplySideRevenue.add(WMON_MAINNET, interestSupplySide, 'LVMON Interest to stakers')
  });

  redeemLogs.forEach((log: any) => {
    const feeAmount = BigInt(log.feeAmount);
    if (feeAmount > 0n) {
      addFee(dailyFees, log.reserveToken, feeAmount, METRIC.MINT_REDEEM_FEES);
      addFee(dailyProtocolRevenue, log.reserveToken, feeAmount, METRIC.MINT_REDEEM_FEES);
    }
  });

  withdrawalLogs.forEach((log: any) => {
    const fee = BigInt(log.fee);
    if (fee > 0n) {
      addFee(dailyFees, LVMON, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
      addFee(dailyProtocolRevenue, LVMON, fee, METRIC.DEPOSIT_WITHDRAW_FEES);
    }
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue
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
    Fees: 'Total fees include perps fees, redeem/withdrawal fees, and InterestDistributed.interest from LVMON events.',
    Revenue: 'Protocol revenue includes all fees except InterestDistributed, where only interestFee is protocol revenue.',
    ProtocolRevenue: 'Protocol revenue includes all fees except InterestDistributed, where only interestFee is protocol revenue.',
    SupplySideRevenue: 'The amount of interest paid to LVMON stakers'
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.OPEN_CLOSE_FEES]: 'Open/close/holding/funding fees from perpetual trades.',
      'LVMON Interest': 'Total interest accrued by the LVMON issuer.',
      [METRIC.MINT_REDEEM_FEES]: 'Fees charged on LVMON redemptions.',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdrawal fees from the sLVMON vault.',
    },
    Revenue: {
      [METRIC.OPEN_CLOSE_FEES]: 'Open/close/holding/funding fees from perpetual trades.',
      'LVMON Performance Fees': 'Performance fee portion of LVMON interest retained by protocol.',
      [METRIC.MINT_REDEEM_FEES]: 'Fees charged on LVMON redemptions.',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdrawal fees from the sLVMON vault.',
    },
    ProtocolRevenue: {
      [METRIC.OPEN_CLOSE_FEES]: 'Open/close/holding/funding fees from perpetual trades.',
      'LVMON Performance Fees': 'Performance fee portion of LVMON interest retained by protocol.',
      [METRIC.MINT_REDEEM_FEES]: 'Fees charged on LVMON redemptions.',
      [METRIC.DEPOSIT_WITHDRAW_FEES]: 'Withdrawal fees from the sLVMON vault.',
    },
    SupplySideRevenue: {
      'LVMON Interest to stakers': 'LVMON interest distributed to stakers after protocol performance fee.',
    },
  },
};

export default adapter;
