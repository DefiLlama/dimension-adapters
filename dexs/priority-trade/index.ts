import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryAllium, getAlliumChain } from "../../helpers/allium";

const ROUTER   = "0x89ad89c9d1fc32cbe204e5780f04cf9b396118eb";
const TREASURY = "0xaa8995ea9d805089acf102a2a80dc92ca7a5c9fb";

const fetch_ = async (options: FetchOptions) => {
  const dailyFees            = options.createBalances();
  const dailyRevenue         = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const feeRows = await queryAllium(`
    SELECT SUM(CAST(value AS NUMERIC)) AS value
    FROM ${getAlliumChain(CHAIN.MEGAETH)}.raw.traces
    WHERE to_address   = '${TREASURY}'
      AND from_address = '${ROUTER}'
      AND call_type    = 'call'
      AND status       = 1
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);

  const value = feeRows[0]?.value ?? 0;
  dailyFees.addGasToken(value,            METRIC.TRADING_FEES);
  dailyRevenue.addGasToken(value,         METRIC.TRADING_FEES);
  dailyProtocolRevenue.addGasToken(value, METRIC.TRADING_FEES);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch: fetch_,
  chains: [CHAIN.MEGAETH],
  start: "2026-02-04",
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees:            "All trading fees paid by users while using Priority.",
    Revenue:         "Fees collected by Priority protocol.",
    ProtocolRevenue: "Part of the revenue flows to the Priority Trade treasury wallet and is used to buy back Megalio NFTs.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "All trading fees paid by users while using Priority.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]: "Trading fees collected by the Priority Trade protocol.",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]: "Portion of trading fees sent to the Priority Trade treasury for Megalio NFT buybacks.",
    },
  },
};

export default adapter;
