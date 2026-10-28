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
const REPORTED = "event Reported(uint64 indexed session, uint8 indexed seat, uint256 usd, bytes32 receiptHash)";
const BELL = "event Bell(uint64 indexed session, uint256 spentUsd, uint256 burnedUsd)";
// Bounded historical correction, not an automatic detector for future backing.
// FACT purpose: https://quotum.org/governance/qip-4/execution.json (27, 28)
// and https://quotum.org/governance/qip-5/execution.json (30).
// DERIVED Bell prices reproduce Burned conversion and the complete pinned forward.
// Published onward amounts are checked against the keeper's USD / Bell-price rule.
const BACKING_SETTLEMENTS = [
  {
    "session": 27,
    "baselineBlock": 95364436,
    "reportBlock": 95372459,
    "bellBlock": 95372482,
    "reportTx": "0xc942941c4c0742db694992018fabbf7e856090a45303492abe911d78516eb174",
    "bellTx": "0x8262b54a8236237d0b1465c678daaac3c2978a6089dd255a1a8fa3b7fbdf25c4",
    "forwardTx": "0x6b703a4c3583300a4ac4399d7b6f5af5256390e398c77b4a79dc9ffd2e697b8c",
    "forwardedNvda": "2572539190326060408",
    "priceWei": "212139314360000000000",
    "backingNvda": "2451219386509192826",
    "onwardRecord": "https://quotum.org/governance/qip-4/sessions/27/onward.json"
  },
  {
    "session": 28,
    "baselineBlock": 96188978,
    "reportBlock": 96201099,
    "bellBlock": 96201131,
    "reportTx": "0x8d2371309a7a86f7d362ae9c62f6ca22e4afe58a2b32028e2fb66f2c67e35aa7",
    "bellTx": "0x5bccd41e08ca060b13ae411c628e6a7ca1f73b9f14d162d8a08af9feb03491d7",
    "forwardTx": "0xe2ede14f5615ab88d5ea6476b6d9edf403bd3dda565059eff5352fb6feddb1ed",
    "forwardedNvda": "2493221385074083647",
    "priceWei": "211163558580000000000",
    "backingNvda": "2272496747198926656",
    "onwardRecord": "https://quotum.org/governance/qip-4/sessions/28/onward.json"
  },
  {
    "session": 30,
    "baselineBlock": 97846581,
    "reportBlock": 97847162,
    "bellBlock": 97847180,
    "reportTx": "0x0207580d506759a733b337797da6424d28f2dadadefed962f83f3cc6b5a4eab4",
    "bellTx": "0xad18ae92342d4455b5aa0a79528b5f4cce12ed957bc853f0acd4f44cdb8bebec",
    "forwardTx": "0x077ec524127e89ddfdfc61c3c848f4ef728dbdb3084fe29b5cc0304f3b7a96dd",
    "forwardedNvda": "2618430015662601171",
    "priceWei": "211163558580000000000",
    "backingNvda": "2462546111160540567",
    "onwardRecord": "https://quotum.org/governance/qip-5/sessions/30/onward.json"
  }
];
const TAX = "QUOTUM Trading Tax";
const PROTOCOL = "Trading Tax To Protocol";
const INFERENCE = "Inference Provider Payments";

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

  const dailyRevenue = dailyFees.clone();
  // Only window-owned payments are booked. Historical queries below supply context only.
  const payments = await options.getLogs({ target: SINK, eventAbi: FORWARDED, entireLog: true });
  for (const payment of payments) {
    const amount = BigInt(payment.args.nvda);
    let backingNvda = 0n;
    const settlement = BACKING_SETTLEMENTS.find(s => s.forwardTx === payment.transactionHash.toLowerCase());
    if (settlement) {
      if (amount !== BigInt(settlement.forwardedNvda)) throw new Error("Historical forward amount changed");
      // A normal 20:00 hourly window lacks the preceding 19:xx reports.
      // Fetch the bounded report context explicitly, even outside the current window.
      const reports = await options.getLogs({ target: SINK, eventAbi: REPORTED,
        fromBlock: settlement.baselineBlock, toBlock: settlement.bellBlock, entireLog: true });
      const bells = await options.getLogs({ target: SINK, eventAbi: BELL,
        fromBlock: settlement.bellBlock, toBlock: settlement.bellBlock, entireLog: true });
      const matchedBells = bells.filter(b => Number(b.args.session) === settlement.session &&
        b.transactionHash.toLowerCase() === settlement.bellTx);
      if (matchedBells.length !== 1) throw new Error("Historical bell missing or duplicated");
      const bell = matchedBells[0];
      if (Number(bell.blockNumber) !== settlement.bellBlock) throw new Error("Historical bell block changed");
      const conversions = await options.getLogs({ target: SINK, eventAbi: BURNED,
        fromBlock: settlement.bellBlock, toBlock: settlement.bellBlock, entireLog: true });
      const matchedBurns = conversions.filter(b => Number(b.args.session) === settlement.session &&
        b.transactionHash.toLowerCase() === settlement.bellTx);
      if (matchedBurns.length !== 1) throw new Error("Historical burn conversion missing or duplicated");
      const burn = matchedBurns[0];
      const priceWei = BigInt(settlement.priceWei);
      if (priceWei <= 0n || Number(burn.blockNumber) !== settlement.bellBlock ||
          BigInt(burn.args.usd) !== BigInt(bell.args.burnedUsd) || BigInt(burn.args.tokens) <= 0n ||
          BigInt(burn.args.usd) <= 0n || BigInt(burn.args.nvdaIn) <= 0n ||
          BigInt(burn.args.usd) * 10n ** 18n / priceWei !== BigInt(burn.args.nvdaIn) ||
          BigInt(bell.args.spentUsd) * 10n ** 18n / priceWei !== amount)
        throw new Error("Historical Bell conversion changed");
      const previous = new Map();
      const final = new Map();
      for (const report of reports) {
        if (Number(report.args.session) !== settlement.session) continue;
        const seat = String(report.args.seat), usd = BigInt(report.args.usd);
        const block = Number(report.blockNumber);
        if (!Number.isSafeInteger(block)) throw new Error("Report block missing");
        if (report.transactionHash.toLowerCase() === settlement.reportTx) {
          if (block !== settlement.reportBlock || final.has(seat)) throw new Error("Ambiguous final report");
          final.set(seat, usd);
        } else if (block < settlement.reportBlock) {
          const before = previous.get(seat);
          if (before && before.block === block && before.usd !== usd) throw new Error("Ambiguous prior report");
          if (!before || before.block < block) previous.set(seat, { block, usd });
        } else throw new Error("Unexpected report after historical final report");
      }
      // All 13 seats increase in these reviewed batches. A one-seat late usage
      // report, such as session 31's $2.35, must remain a supplier cost.
      if (final.size !== 13 || previous.size !== 13) throw new Error("Incomplete historical report cohort");
      let spent = 0n, backing = 0n;
      for (const [seat, usd] of final) {
        const before = previous.get(seat);
        if (!before || usd <= before.usd) throw new Error("Historical cohort uplift changed");
        spent += usd;
        backing += usd - before.usd;
      }
      if (spent !== BigInt(matchedBells[0].args.spentUsd)) throw new Error("Reports do not reconcile to Bell");
      // Keeper settlement: floor(backing USD * 1e18 / Bell NVDA/USD price).
      // Dividing an already-rounded Forwarded amount pro rata loses 1 wei in S27.
      backingNvda = backing * 10n ** 18n / priceWei;
      if (backingNvda !== BigInt(settlement.backingNvda) || backingNvda > amount)
        throw new Error("Historical backing does not match published onward amount");
    }
    const supplierNvda = amount - backingNvda;
    dailySupplySideRevenue.add(NVDA, supplierNvda, INFERENCE);
    dailyRevenue.add(NVDA, -supplierNvda, TAX);
  }

  const burns = await options.getLogs({ target: SINK, eventAbi: BURNED });
  for (const log of burns)
    // Value the NVDA spent, not the purchased QUOTUM or the duplicate Bell event.
    dailyHoldersRevenue.add(NVDA, log.nvdaIn, METRIC.TOKEN_BUY_BACK);

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
    Revenue: "Claimed QUOTUM trading tax less forwarded NVDA attributed to supplier funding. Only the reviewed session 27, 28 and 30 backing amounts are excluded, using final less prior reports converted at their Bell oracle prices and matched to public onward records; all other forwards remain supplier funding. Recognition stays at execution.",
    ProtocolRevenue: "The fixed 40% share of claimed QUOTUM trading tax transferred to the protocol recipient in NVDA.",
    HoldersRevenue: "NVDA spent on successful QUOTUM buybacks and burns at the daily bell, excluding failed purchases and direct token burns.",
    SupplySideRevenue: "Executed Forwarded NVDA less the reviewed backing portions for sessions 27, 28 and 30. Backing is protocol funds sent to the protocol's trading agent, not supplier cost. Purpose comes from public execution and onward records, not the event ABI.",
  },
  breakdownMethodology: {
    Fees: { [TAX]: "Gross NVDA collected in TaxSink claims before the fixed 40% protocol share is transferred." },
    Revenue: { [TAX]: "Gross claimed NVDA less executed forwards after excluding the reviewed protocol-controlled backing portions; no reserve transfer is added to Fees." },
    ProtocolRevenue: protocolBreakdown,
    HoldersRevenue: holdersBreakdown,
    SupplySideRevenue: { [INFERENCE]: "Forwarded NVDA net of the reviewed historical backing allocation; unrecognized transfers remain fully included." },
  },
};

export default adapter;
