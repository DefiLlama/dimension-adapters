import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Published deployment and economics: https://quotum.org/docs#contracts
const SINK = "0x42AbC7b64eD47dB6899b4F01Aa6c765c600a53a2";
const NVDA = ADDRESSES.robinhood.NVDA;
const CLAIMED = "event Claimed(uint256 nvda, uint256 ops)";
const FORWARDED = "event Forwarded(uint256 nvda)";
const BURNED = "event Burned(uint64 indexed session, uint256 usd, uint256 nvdaIn, uint256 tokens, uint256 twap)";
const TAX = "QUOTUM Trading Tax";
const PROTOCOL = "Trading Tax To Protocol";
const INFERENCE = "Provider And Backing Funding";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const claims = await options.getLogs({ target: SINK, eventAbi: CLAIMED });
  for (const log of claims) {
    dailyFees.add(NVDA, log.nvda, TAX);
    // The emitted amount is the immutable 40% share, including integer rounding.
    dailyProtocolRevenue.add(NVDA, log.ops, PROTOCOL);
  }

  const payments = await options.getLogs({ target: SINK, eventAbi: FORWARDED });
  for (const log of payments)
    dailySupplySideRevenue.add(NVDA, log.nvda, INFERENCE);

  const burns = await options.getLogs({ target: SINK, eventAbi: BURNED });
  for (const log of burns)
    // Value the NVDA spent, not the purchased QUOTUM or the duplicate Bell event.
    dailyHoldersRevenue.add(NVDA, log.nvdaIn, METRIC.TOKEN_BUY_BACK);

  // Forwarded measures cash sent to PAY_TO, including backing funding.
  // Its event alone does not distinguish backing from consumed inference.
  const dailyRevenue = dailyFees.clone();
  // Subtract under the same source label to avoid a negative provider breakdown row.
  for (const log of payments) dailyRevenue.add(NVDA, -BigInt(log.nvda), TAX);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const protocolBreakdown = {
  [PROTOCOL]: "The fixed 40% share of claimed trading tax transferred to the protocol recipient.",
};
const holdersBreakdown = {
  [METRIC.TOKEN_BUY_BACK]: "NVDA spent on successful QUOTUM purchases followed by burning the purchased tokens.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Provider payments settle from retained tax; a payment-only hour has negative cash gross profit.
  allowNegativeValue: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // First production TaxSink claims; excludes trading before this deployment.
  start: "2026-09-26",
  doublecounted: true, // Creator trading tax is also accounted for by the underlying Pons adapter.
  methodology: {
    Fees: "QUOTUM trading tax collected by TaxSink, measured in NVDA when claimed, excluding Pons platform fees and direct funding transfers.",
    Revenue: "Claimed QUOTUM trading tax less cash NVDA forwarded to PAY_TO, including backing funding, with claims and transfers recognized when executed; retained funding and later buybacks can make attribution differ within a period.",
    ProtocolRevenue: "The fixed 40% share of claimed QUOTUM trading tax transferred to the protocol recipient in NVDA.",
    HoldersRevenue: "NVDA spent on successful QUOTUM buybacks and burns at the daily bell, excluding failed purchases and direct token burns.",
    SupplySideRevenue: "Cash NVDA forwarded by TaxSink to PAY_TO, including seat-use funding and backing funding recorded in keeper reports. This measures executed transfers, not inference consumption.",
  },
  breakdownMethodology: {
    Fees: { [TAX]: "Gross NVDA collected in TaxSink claims before the fixed 40% protocol share is transferred." },
    Revenue: { [TAX]: "Gross claimed NVDA trading tax less executed PAY_TO transfers, including backing funding, on the existing cash basis." },
    ProtocolRevenue: protocolBreakdown,
    HoldersRevenue: holdersBreakdown,
    SupplySideRevenue: { [INFERENCE]: "NVDA actually forwarded to immutable PAY_TO; the event does not separate provider funding, prepayment and backing." },
  },
};

export default adapter;
