import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"
import { addTokensReceived } from "../../helpers/token"

// SmartX (https://app.smartx.io) is a prediction-market trading terminal that routes
// orders to the Polymarket CLOB V2 under the Polymarket Builders Program. Every SmartX
// order carries SmartX's builder code, which is emitted on-chain in the OrderFilled
// event, so volume and fees are attributed fully on-chain.

// SmartX's Polymarket builder code, present in the OrderFilled event data for
// SmartX-routed orders (zero for orders not routed through SmartX).
const SMARTX_BUILDER_CODE = "0x58d3820045831c879b218ec64514dc191eebadf31a4641670293fddf542643c3"
// Polymarket CTFExchangeV2 OrderFilled event topic0.
const ORDER_FILLED_V2 = "0xd543adfd945773f1a62f74f0ee55a5e3b9b1a28262980ba90b1a89f2ea84d8ee"
// SmartX builder profile wallet, receives daily builder-fee payouts (pUSD).
// https://polygonscan.com/address/0xf37952C830Ff3E1E71694075DFc1C7AB00FDfD1b
const SMARTX_BUILDER_FEE_WALLET = "0xf37952C830Ff3E1E71694075DFc1C7AB00FDfD1b"
// Polymarket builder-fee distributor that pays the wallet above once per day (~00:30 UTC).
// https://polygonscan.com/address/0xacec560fe65386b66afb95ec3e0c6e559c7e0582
const POLYMARKET_BUILDER_FEE_DISTRIBUTOR = "0xacec560fe65386b66afb95ec3e0c6e559c7e0582"
// Polymarket CLOB V2 exchanges on Polygon:
// CTFExchangeV2:     https://polygonscan.com/address/0xe111180000d2663c0091e4f400237545b87b996b
// NegRiskCtfExchange https://polygonscan.com/address/0xe2222d279d744050d28e00520010520000310f59

const fetch = async (options: FetchOptions) => {
  // Volume = collateral side of each SmartX-attributed fill. OrderFilled data layout:
  // [makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled, fee, builderCode].
  // assetId 0 is the pUSD collateral (6 decimals), so pick the amount on that side.
  const query = `
    SELECT SUM(
      CASE WHEN bytearray_to_uint256(bytearray_substring(data, 1, 32)) = 0
        THEN bytearray_to_uint256(bytearray_substring(data, 65, 32))
        ELSE bytearray_to_uint256(bytearray_substring(data, 97, 32))
      END
    ) / 1e6 AS daily_volume
    FROM polygon.logs
    WHERE contract_address IN (0xe111180000d2663c0091e4f400237545b87b996b, 0xe2222d279d744050d28e00520010520000310f59)
      AND topic0 = ${ORDER_FILLED_V2}
      AND bytearray_substring(data, 161, 32) = ${SMARTX_BUILDER_CODE}
      AND TIME_RANGE
  `
  const data = await queryDuneSql(options, query)
  const dailyVolume = data[0]?.daily_volume ?? 0

  // Fees = the actual on-chain builder-fee payouts to SmartX's builder wallet, counted
  // from the Polymarket distributor only (not a fee-rate estimate on volume).
  const dailyFees = await addTokensReceived({
    options,
    targets: [SMARTX_BUILDER_FEE_WALLET],
    fromAddressFilter: POLYMARKET_BUILDER_FEE_DISTRIBUTOR,
  })

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  }
}

const adapter: SimpleAdapter = {
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.POLYGON],
  start: '2026-05-06',
  methodology: {
    Volume: "Notional collateral volume of Polymarket CLOB V2 fills carrying SmartX's builder code in the on-chain OrderFilled event, i.e. orders routed through the SmartX terminal.",
    Fees: "Builder fees (Polymarket Builders Program) earned on SmartX-routed orders, measured as the daily on-chain payouts from Polymarket's builder fee distributor to SmartX's builder profile wallet.",
    Revenue: "All builder fees accrue to SmartX.",
    ProtocolRevenue: "All builder fees accrue to SmartX.",
  }
}

export default adapter
