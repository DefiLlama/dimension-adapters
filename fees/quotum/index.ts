import ADDRESSES from '../../helpers/coreAssets.json'
import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Published deployment and economics: https://quotum.org/docs#contracts
const SINK = "0x42AbC7b64eD47dB6899b4F01Aa6c765c600a53a2";
const NVDA = ADDRESSES.robinhood.NVDA;
const CLAIMED = "event Claimed(uint256 nvda, uint256 ops)";
const FORWARDED = "event Forwarded(uint256 nvda)";
const BELL = "event Bell(uint64 indexed session, uint256 spentUsd, uint256 burnedUsd)";
const BURNED = "event Burned(uint64 indexed session, uint256 usd, uint256 nvdaIn, uint256 tokens, uint256 twap)";
const TAX = "QUOTUM Trading Tax";
const PROTOCOL = "Trading Tax To Protocol";
const INFERENCE = "Inference Provider Payments";

//https://quotum.org/governance
const BACKING_ROUNDS = [
  // Backing stopped after session 28: https://quotum.org/governance/qip-4/execution.json
  { proposal: "qip-4", firstSession: 27, lastSession: 28 },
  // "The round runs from session 30 to session 43 at most": https://quotum.org/governance/qip-5/execution.json
  { proposal: "qip-5", firstSession: 30, lastSession: 43 },
];

const BELL_LOOKBACK_BLOCKS = 36_000;

async function getBackingNvda(session: number): Promise<bigint> {
  const round = BACKING_ROUNDS.find(r => session >= r.firstSession && session <= r.lastSession);
  if (!round) return 0n;
  const url = `https://quotum.org/governance/${round.proposal}/sessions/${session}/onward.json`;
  const record = await getConfig(`quotum/${round.proposal}-onward-${session}`, undefined, {
    fetcher: () => axios.get(url).then(res => res.data).catch(e => {
      if (e.response?.status === 404) return { unpublished: true };
      throw e;
    }),
  });
  if (record.unpublished) return 0n;
  if (record.amountNvdaWei === undefined || Number(record.session) !== session)
    throw new Error(`Quotum onward record unavailable: ${url}`);
  return BigInt(record.amountNvdaWei);
}

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
  const payments = await options.getLogs({ target: SINK, eventAbi: FORWARDED, onlyArgs: false });
  if (payments.length) {
    const bells = await options.getLogs({ target: SINK, eventAbi: BELL, onlyArgs: false,
      fromBlock: (await options.getFromBlock()) - BELL_LOOKBACK_BLOCKS });
    bells.sort((a, b) => a.blockNumber - b.blockNumber);
    for (const payment of payments) {
      const amount = BigInt(payment.args.nvda);
      const bell = bells.filter(b => b.blockNumber <= payment.blockNumber).pop();
      if (!bell) throw new Error(`No Bell before forward ${payment.transactionHash}`);
      const backingNvda = await getBackingNvda(Number(bell.args.session));
      if (backingNvda > amount) throw new Error(`Session ${bell.args.session} backing exceeds its forward`);
      const supplierNvda = amount - backingNvda;
      dailySupplySideRevenue.add(NVDA, supplierNvda, INFERENCE);
      dailyRevenue.add(NVDA, -supplierNvda, TAX);
    }
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
    Revenue: "Claimed QUOTUM trading tax less the NVDA forwarded to pay inference providers; NVDA forwarded to fund the protocol's own trading agent stays in revenue.",
    ProtocolRevenue: "The fixed 40% share of claimed QUOTUM trading tax transferred to the protocol recipient in NVDA.",
    HoldersRevenue: "NVDA spent on successful QUOTUM buybacks and burns at the daily bell, excluding failed purchases and direct token burns.",
    SupplySideRevenue: "NVDA forwarded from TaxSink to pay inference providers, excluding the portion the team reports moving on to fund the protocol's trading agent.",
  },
  breakdownMethodology: {
    Fees: { [TAX]: "Gross NVDA collected in TaxSink claims before the fixed 40% protocol share is transferred." },
    Revenue: { [TAX]: "Gross claimed NVDA trading tax less NVDA forwarded to pay inference providers." },
    ProtocolRevenue: protocolBreakdown,
    HoldersRevenue: holdersBreakdown,
    SupplySideRevenue: { [INFERENCE]: "NVDA forwarded to pay for inference, net of the trading-agent funding in the team's published per-session records; a forward counts in full until its record is published." },
  },
};

export default adapter;
