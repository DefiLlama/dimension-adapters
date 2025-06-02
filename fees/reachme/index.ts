import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const REACH_V1 = '0x3ff200940a172AbB1c70646d500cA22cdBCEA915'
const REACH_V2 = '0x3479E83c089Bb42DC43C6FEfe5F89Ea0e5bA47F9'

const ReachmePaymentDepositedEvent = "event PaymentDeposited(uint256 indexed depositId, string identifier, address requester, address kol, uint256 totalAmount, uint256 instantAmount, uint256 escrowAmount)"

const RefundedEvent = "event RefundIssued(uint256 indexed depositId, string identifier, address requester, uint256 amount)"

const ReachmeProtocolFeeWallet = '0x0c602fFfe55727BbFa46289E7b2aF7440672F5C4'


const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const payment_logs_v1: any[] = await options.getLogs({
    target: REACH_V1,
    eventAbi: ReachmePaymentDepositedEvent,
    entireLog: true
  });

  const payment_logs_v2: any[] = await options.getLogs({
    target: REACH_V2,
    eventAbi: ReachmePaymentDepositedEvent,
    entireLog: true
  });

  payment_logs_v1.forEach((log: any) => {
    dailyFees.addGasToken(log.args.totalAmount);
    dailyProtocolRevenue.addGasToken(Number(log.args.totalAmount) - Number(log.args.instantAmount) - Number(log.args.escrowAmount));
  });

  payment_logs_v2.forEach((log: any) => {
    dailyFees.addGasToken(log.args.totalAmount);
    dailyProtocolRevenue.addGasToken(Number(log.args.totalAmount) - Number(log.args.instantAmount) - Number(log.args.escrowAmount));
  });

  const dailyRefunds = options.createBalances();
  const refund_logs_v1: any[] = await options.getLogs({
    target: REACH_V1,
    eventAbi: RefundedEvent,
    entireLog: true
  });

  const refund_logs_v2: any[] = await options.getLogs({
    target: REACH_V2,
    eventAbi: RefundedEvent,
    entireLog: true
  });

  refund_logs_v1.forEach((log: any) => {
    dailyRefunds.addGasToken(log.args.amount);
  });

  refund_logs_v2.forEach((log: any) => {
    dailyRefunds.addGasToken(log.args.amount);
  });

  dailyFees.subtract(dailyRefunds);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const meta = {
  methodology: {
    Fees: "All fees paid by users as fee for sending message to KOL via Reachme - Refunds are subtracted from the total fees",
    Revenue: "Protocol revenue from the total fees",
    ProtocolRevenue: "Protocol revenue from the total fees",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  allowNegativeValue: true, // as there can be more refunds than fees
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-03-25",
      meta
    },
  },
};

export default adapter;
