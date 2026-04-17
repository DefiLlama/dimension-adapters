import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryAllium, getAlliumChain } from "../../helpers/allium";

const ROUTER   = "0x89ad89c9d1fc32cbe204e5780f04cf9b396118eb";
const TREASURY = "0xaa8995ea9d805089acf102a2a80dc92ca7a5c9fb";

const fetch_ = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const feeRows = await queryAllium(`
    SELECT SUM(value) AS value
    FROM ${getAlliumChain(CHAIN.MEGAETH)}.raw.traces
    WHERE to_address   = '${TREASURY}'
      AND from_address = '${ROUTER}'
      AND status = 1
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);

  dailyFees.addGasToken(feeRows[0]?.value ?? 0, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue:         dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
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
    Revenue: {
      [METRIC.TRADING_FEES]: "Trading fees collected by the Priority Trade protocol.",
    },
  },
};

export default adapter;
