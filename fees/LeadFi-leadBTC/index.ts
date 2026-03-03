import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const mintEvents = await options.getLogs({
    target: "0xAA69709c0780ED5aA03f96D8CbD4C905861f4699",
    eventAbi: "event DepositConfirmed(address indexed recipient, bytes32 indexed depositId, bytes32 indexed depositTxid, uint256 depositVout, uint256 depositSats, uint256 netSatsAfterFee)"
  })
  const burnEvents = await options.getLogs({
    target: "0xAA69709c0780ED5aA03f96D8CbD4C905861f4699",
    eventAbi: "event WithdrawalFinalized(uint64 indexed id, uint256 userReceiveSats, uint256 minerFeeSats, uint256 operatorFeeSats, uint256 withdrawFeeSats, uint256 spendTotalSats, uint256 burnedSats, bytes32 btcTxId, uint256 vout)"
  })

  const dailyFees = options.createBalances()

  for (const event of mintEvents) {
    const depositSats = Number(event.depositSats)
    const netAfter = Number(event.netSatsAfterFee)
    const fee = depositSats - netAfter

    dailyFees.add('0x7CB8A5ABf019983eD053484D5ad17F96FEc56F28', fee > 0 ? fee : 0, METRIC.MINT_REDEEM_FEES)
  }

  for (const ev of burnEvents) {
    dailyFees.add('0x7CB8A5ABf019983eD053484D5ad17F96FEc56F28', Number(ev.withdrawFeeSats), METRIC.MINT_REDEEM_FEES)
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

export default {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: '2025-09-28',
  methodology: {
    Fees: "Minting and buring fees paid by users.",
    UserFees: "Minting and buring fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  },
}
