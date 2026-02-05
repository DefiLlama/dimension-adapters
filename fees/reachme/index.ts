import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const REACH_V1 = '0x3ff200940a172AbB1c70646d500cA22cdBCEA915'
const REACH_V2 = '0x3479E83c089Bb42DC43C6FEfe5F89Ea0e5bA47F9'

const PaymentDepositedEvent = "event PaymentDeposited(uint256 indexed depositId, string identifier, address requester, address kol, uint256 totalAmount, uint256 instantAmount, uint256 escrowAmount)"

const RefundIssuedEvent = "event RefundIssued(uint256 indexed depositId, string identifier, address requester, uint256 amount)"

const ReachmeProtocolFeeWallet = '0x0c602fFfe55727BbFa46289E7b2aF7440672F5C4'

const payment_iface = new ethers.Interface([PaymentDepositedEvent])
const refund_iface = new ethers.Interface([RefundIssuedEvent])

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyRefunds = options.createBalances();

  const payment_logs_v1: any[] = await options.getLogs({
    target: REACH_V1,
    eventAbi: PaymentDepositedEvent,
    entireLog: true
  });

  const payment_logs_v2: any[] = await options.getLogs({
    target: REACH_V2,
    eventAbi: PaymentDepositedEvent,
    entireLog: true
  });

  payment_logs_v1.forEach((log: any) => {
    const parsed = payment_iface.parseLog(log)
    dailyFees.addGasToken(parsed?.args.totalAmount);
    dailyProtocolRevenue.addGasToken(Number(parsed?.args.totalAmount) - Number(parsed?.args.instantAmount) - Number(parsed?.args.escrowAmount));
  });

  payment_logs_v2.forEach((log: any) => {
    const parsed = payment_iface.parseLog(log)
    dailyFees.addGasToken(parsed?.args.totalAmount);
    dailyProtocolRevenue.addGasToken(Number(parsed?.args.totalAmount) - Number(parsed?.args.instantAmount) - Number(parsed?.args.escrowAmount));
  });

  const refund_logs_v1: any[] = await options.getLogs({
    target: REACH_V1,
    eventAbi: RefundIssuedEvent,
    entireLog: true
  });

  const refund_logs_v2: any[] = await options.getLogs({
    target: REACH_V2,
    eventAbi: RefundIssuedEvent,
    entireLog: true
  });

  refund_logs_v1.forEach((log: any) => {
    const parsed = refund_iface.parseLog(log)
    dailyRefunds.addGasToken(parsed?.args.amount);
  });

  refund_logs_v2.forEach((log: any) => {
    const parsed = refund_iface.parseLog(log)
    dailyRefunds.addGasToken(parsed?.args.amount);
  });

  // Subtract refunds from fees
  dailyFees.subtract(dailyRefunds);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-03-25",
    },
  },
  methodology: {
    Fees: "All fees paid by users for sending message to KOL via Reachme minus the Refunds",
    Revenue: "Protocol revenue from the total fees",
    ProtocolRevenue: "Protocol revenue from the total fees",
  },
  allowNegativeValue: true, // as there can be more refunds than fees
};

export default adapter;
