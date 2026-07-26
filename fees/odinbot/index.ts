import ADDRESSES from "../../helpers/coreAssets.json"
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryAllium } from "../../helpers/allium"
import { METRIC } from "../../helpers/metrics"

//https://docs.odinbot.io/tracking-academy/how-to-look-at-your-fees
const FEE_RECIPIENTS = ["oDinBoTPS3Pz5gBv3FSTkPZXTyN3v7bZo6A2b3dooNP", "HGgT2s5ZWWDrLWMKkSgSLKwt2YpTmRLVPLxFhStRRaEV", "MvVPcaHhXpuNE8zX67Z53QLqmyYQxWfhRDW9bMYZtK5"]
const SOL_MINT = ADDRESSES.solana.SOL
const REFERRAL_FEE_LABEL = "Referral Fees"

async function fetch(options: FetchOptions) {
  const [{ protocol_fees, referral_fees }] = await queryAllium(`
    WITH protocol_fees AS (
      SELECT txn_id, raw_amount AS protocol_amount
      FROM solana.assets.transfers
      WHERE to_address IN ('${FEE_RECIPIENTS.join("', '")}')
        AND from_address NOT IN ('${FEE_RECIPIENTS.join("', '")}')
        AND mint = '${SOL_MINT}'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    referral_fees AS (
      SELECT r.raw_amount
      FROM solana.assets.transfers r
      INNER JOIN protocol_fees p ON r.txn_id = p.txn_id
      WHERE r.mint = '${SOL_MINT}'
        AND r.from_address NOT IN ('${FEE_RECIPIENTS.join("', '")}')
        AND r.to_address NOT IN ('${FEE_RECIPIENTS.join("', '")}')
        AND ABS(r.raw_amount - ROUND(p.protocol_amount * 40.0 / 60.0)) <= 1
        AND r.block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND r.block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    )
    SELECT
      COALESCE((SELECT SUM(protocol_amount) FROM protocol_fees), 0) AS protocol_fees,
      COALESCE((SELECT SUM(raw_amount) FROM referral_fees), 0) AS referral_fees
  `)

  const dailyRevenue = options.createBalances()
  dailyRevenue.add(SOL_MINT, protocol_fees, METRIC.TRADING_FEES)

  const dailySupplySideRevenue = options.createBalances()
  dailySupplySideRevenue.add(SOL_MINT, referral_fees, REFERRAL_FEE_LABEL)

  const dailyFees = dailyRevenue.clone(1, METRIC.TRADING_FEES)
  dailyFees.addBalances(dailySupplySideRevenue, METRIC.TRADING_FEES)

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Odinbot charges a 1% fee on copy-trades (min 0.001 SOL). Total fees are the protocol share received by the Odin fee wallet plus affiliate payouts in the same transaction.",
  UserFees: "Odinbot charges a 1% fee on copy-trades (min 0.001 SOL). Total fees are the protocol share received by the Odin fee wallet plus affiliate payouts in the same transaction.",
  Revenue: "The 60% (100% if no referral code is applied) protocol share of Odinbot trading fees retained after affiliate payouts.",
  ProtocolRevenue: "The 60% (100% if no referral code is applied) protocol share of Odinbot trading fees retained after affiliate payouts.",
  SupplySideRevenue: "The 40% affiliate commission paid to referrers in the same transaction, if a referral code is applied.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "1% of trade value, min 0.001 SOL, including affiliate payouts.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "1% of trade value, min 0.001 SOL, including affiliate payouts.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "60% (100% if no referral code is applied) protocol share of Odinbot trading fees.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "60% (100% if no referral code is applied) protocol share of Odinbot trading fees.",
  },
  SupplySideRevenue: {
    [REFERRAL_FEE_LABEL]: "40% affiliate commission paid to referrers in the same transaction, if a referral code is applied.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  start: "2024-03-01",
  methodology,
  breakdownMethodology,
}

export default adapter;