import ADDRESSES from '../../helpers/coreAssets.json'
import axios from "axios";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
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
  // Fixed $1,000 round (https://quotum.org/governance/qip-5/execution.json), used up by sessions 30 and 34 ($520 + $480, https://quotum.org/log)
  { proposal: "qip-5", firstSession: 30, lastSession: 34 },
];
const PUBLISHED_BACKING_SESSIONS = new Set([27, 28, 30, 34]);

const BELL_LOOKBACK_BLOCKS = 36_000;

async function getBackingNvda(session: number): Promise<bigint> {
  const round = BACKING_ROUNDS.find(r => session >= r.firstSession && session <= r.lastSession);
  if (!round) return 0n;
  const url = `https://quotum.org/governance/${round.proposal}/sessions/${session}/onward.json`;
  let record;
  try {
    record = (await axios.get(url, { timeout: 30_000 })).data;
  } catch (e: any) {
    if (e.response?.status === 404 && !PUBLISHED_BACKING_SESSIONS.has(session)) return 0n;
    throw e;
  }
  if (!record || Number(record.session) !== session || typeof record.amountNvdaWei !== "string"
    || !/^\d+$/.test(record.amountNvdaWei))
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
  if (burns.length) {
    const fromBlock = await options.getFromBlock();
    const toBlock = await options.getToBlock();
    const dayFromBlock = await options.getBlock(options.startOfDay, options.chain, {});
    const getCapLogs = async (eventAbi: string, fromBlock: number, toBlock: number) => {
      const logs = await options.getLogs({ target: SINK, eventAbi, onlyArgs: false, fromBlock, toBlock });
      const seen = new Set<string>();
      return logs.filter(log => {
        const blockNumber = Number(log.blockNumber);
        if (!(fromBlock <= blockNumber && blockNumber <= toBlock)) return false;
        const hash = log.transactionHash.toLowerCase();
        // Without logIndex, fall back to hash + block + JSON args, including bigint values.
        const key = log.logIndex != null ? `${hash}:${log.logIndex}`
          : `${hash}:${blockNumber}:${JSON.stringify(log.args, (_, value) => typeof value === 'bigint' ? value.toString() : value)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const dayClaims = await getCapLogs(CLAIMED, dayFromBlock, toBlock);
    // The ops share leaves the sink in the claim call, so only the net claim can fund holders revenue.
    const revenueEvents = dayClaims.map(log => ({ blockNumber: Number(log.blockNumber), amount: BigInt(log.args.nvda) - BigInt(log.args.ops) }));
    const dayPayments = await getCapLogs(FORWARDED, dayFromBlock, toBlock);
    if (dayPayments.length) {
      const bells = await getCapLogs(BELL, dayFromBlock - BELL_LOOKBACK_BLOCKS, toBlock);
      bells.sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber));
      for (const payment of dayPayments) {
        const amount = BigInt(payment.args.nvda);
        const bell = bells.filter(b => Number(b.blockNumber) <= Number(payment.blockNumber)).pop();
        if (!bell) throw new Error(`No Bell before forward ${payment.transactionHash}`);
        const backingNvda = await getBackingNvda(Number(bell.args.session));
        if (backingNvda > amount) throw new Error(`Session ${bell.args.session} backing exceeds its forward`);
        revenueEvents.push({ blockNumber: Number(payment.blockNumber), amount: -(amount - backingNvda) });
      }
    }

    // Recompute earlier burn-hour bookings so multiple bells share the UTC day's budget.
    const earlierBurns = dayFromBlock < fromBlock ? await getCapLogs(BURNED, dayFromBlock, fromBlock - 1) : [];
    let earlierHoldersNvda = 0n;
    if (earlierBurns.length) {
      // startTimestamp (= fromTimestamp) is one second before the logical hour start.
      const windowStartTimestamp = options.startTimestamp + 1;
      let hourFromBlock = dayFromBlock;
      for (let timestamp = options.startOfDay + 3600; timestamp <= windowStartTimestamp; timestamp += 3600) {
        const hourEndBlock = timestamp === windowStartTimestamp ? fromBlock
          : await options.getBlock(timestamp, options.chain, {});
        const hourBurnedNvda = earlierBurns.filter(log => Number(log.blockNumber) >= hourFromBlock && Number(log.blockNumber) < hourEndBlock)
          .reduce((sum, log) => sum + BigInt(log.args.nvdaIn), 0n);
        if (hourBurnedNvda > 0n) {
          const revenueNvda = revenueEvents.filter(log => Number(log.blockNumber) < hourEndBlock)
            .reduce((sum, log) => sum + log.amount, 0n);
          const availableNvda = revenueNvda - earlierHoldersNvda;
          earlierHoldersNvda += availableNvda <= 0n ? 0n : hourBurnedNvda < availableNvda ? hourBurnedNvda : availableNvda;
        }
        hourFromBlock = hourEndBlock;
      }
    }

    const revenueNvda = revenueEvents.reduce((sum, log) => sum + log.amount, 0n);
    const availableNvda = revenueNvda - earlierHoldersNvda;
    const burnedNvda = burns.reduce((sum, log) => sum + BigInt(log.nvdaIn), 0n);
    const holdersNvda = availableNvda <= 0n ? 0n : burnedNvda < availableNvda ? burnedNvda : availableNvda;
    dailyHoldersRevenue.add(NVDA, holdersNvda, METRIC.TOKEN_BUY_BACK);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const protocolBreakdown = {
  [PROTOCOL]: "The fixed 40% share of claimed trading tax transferred to the protocol recipient.",
};
const holdersBreakdown = {
  [METRIC.TOKEN_BUY_BACK]: "Successful QUOTUM buyback spend in each burn hour, limited to revenue from UTC midnight through that hour, less holders revenue already booked that day. Reserve-funded excess is excluded.",
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
    HoldersRevenue: "Successful buyback NVDA is booked only in hours with burns, capped at positive revenue from UTC midnight through that hour, after subtracting earlier holders bookings that day. No holders revenue is booked when that budget is zero or negative. Excess reserve-funded spending, failed purchases and direct token burns are excluded.",
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
