import {FetchOptions} from "../../adapters/types";

/**
 * Fee calculation adapter for LeadBTC on BSC
 */
export default {
  adapter: {
    "bsc": {
      fetch: async (_: any, _1: any, {getLogs, createBalances}: FetchOptions) => {
        // Get all mint (DepositConfirmed) events
        const mints = await getLogs({
          target: "0xAA69709c0780ED5aA03f96D8CbD4C905861f4699",
          eventAbi: "event DepositConfirmed(address indexed recipient, bytes32 indexed depositId, bytes32 indexed depositTxid, uint256 depositVout, uint256 depositSats, uint256 netSatsAfterFee)"
        })

        // Get all burn (WithdrawalFinalized) events
        const burns = await getLogs({
          target: "0xAA69709c0780ED5aA03f96D8CbD4C905861f4699",
          eventAbi: "event WithdrawalFinalized(uint64 indexed id, uint256 userReceiveSats, uint256 minerFeeSats, uint256 operatorFeeSats, uint256 withdrawFeeSats, uint256 spendTotalSats, uint256 burnedSats, bytes32 btcTxId, uint256 vout)"
        })

        const dailyFees = createBalances()

        // --- Deposit fees ---
        // Fee = depositSats - netSatsAfterFee
        for (const ev of mints) {
          const depositSats = BigInt(ev.depositSats ?? 0)
          const netAfter = BigInt(ev.netSatsAfterFee ?? 0)
          let fee = depositSats - netAfter
          if (fee < 0n) fee = 0n
          if (fee > 0n)
            dailyFees.add('0x7CB8A5ABf019983eD053484D5ad17F96FEc56F28', fee.toString())
        }

        // --- Withdrawal fees ---
        for (const ev of burns) {
          const fee = BigInt(ev.withdrawFeeSats ?? 0)
          if (fee > 0n)
            dailyFees.add('0x7CB8A5ABf019983eD053484D5ad17F96FEc56F28', fee.toString())
        }

        return {
          dailyFees,
          dailyRevenue: dailyFees,
          dailyProtocolRevenue: dailyFees,
        }
      },
      start: '2025-09-28',
    }
  },
  methodology: {
    Fees: "Minting and buring fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  }
}
