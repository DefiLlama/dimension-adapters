import BigNumber from "bignumber.js";
import { httpGet } from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { getPositionedLogArgs, PositionedLogArgs } from "../helpers/logs";

// Daily generated swap/flash fees, valued at generation time by the protocol's indexer.
// https://api.abyss.trading/api/v1/metrics/protocol/chart?chainId=4663
const API_URL = "https://api.abyss.trading/api/v1/metrics/protocol/chart";

// Replacement deployment and initial buyback recipient:
// https://robinhoodchain.blockscout.com/address/0x2c3B1b6fe0EDa8e10C0445567b47e66E825B34cd?tab=contract
const FEE_ROUTER = "0x2c3B1b6fe0EDa8e10C0445567b47e66E825B34cd";
const BUYBACK_BURNER = "0xf6c7159e967f28c65d9fb5b919567e04540cd2ff";
const DEPLOYMENT_BLOCK = 50161538; // Beginning of the replacement deployment, 2026-08-30.
const WETH = ADDRESSES.robinhood.WETH;

// Published implementation source: https://robinhoodchain.blockscout.com/address/0xB35b85db23fEF3A146Fbd755D76be12F9e1eBfFC?tab=contract
const DISTRIBUTED = "event Distributed(address indexed caller, uint256 amountPulled, uint256 devAmount, uint256 protocolVaultAmount, uint256 protocolForwarded)";
const RECEIVER_SET = "event ProtocolReceiverSet(address indexed oldReceiver, address indexed newReceiver)";
const FEES = "Trading Fees";
const LP_FEES = "Trading Fees To LPs";
const REVENUE = "Trading Fees To Protocol";
const BUYBACK = "Buyback Funding";

const compareLogs = (a: PositionedLogArgs, b: PositionedLogArgs) =>
  a.blockNumber - b.blockNumber || a.logIndex - b.logIndex;

const fetch = async (options: FetchOptions) => {
  const day = options.startOfDay;
  const end = day + 86400; // The source publishes UTC daily buckets only.
  const data: unknown = await httpGet(`${API_URL}?chainId=4663&interval=day&from=${day}&to=${end - 1}&limit=2`);
  if (!data || typeof data !== "object" || !("chainId" in data) || data.chainId !== 4663
    || !("truncated" in data) || data.truncated !== false || !("items" in data) || !Array.isArray(data.items))
    throw new Error(`Abyss: missing or ambiguous fee data for ${options.dateString}`);
  const rows = data.items.filter((row: unknown): row is Record<string, unknown> =>
    row !== null && typeof row === "object" && "bucket" in row && row.bucket === String(day));
  if (rows.length !== 1)
    throw new Error(`Abyss: missing or ambiguous fee data for ${options.dateString}`);
  const { tradingFeeUsdX18, lpFeeUsdX18, protocolRevenueUsdX18, unpricedFeeCount } = rows[0];
  if (typeof tradingFeeUsdX18 !== "string" || !/^\d+$/.test(tradingFeeUsdX18)
    || typeof lpFeeUsdX18 !== "string" || !/^\d+$/.test(lpFeeUsdX18)
    || typeof protocolRevenueUsdX18 !== "string" || !/^\d+$/.test(protocolRevenueUsdX18)
    || typeof unpricedFeeCount !== "string" || !/^\d+$/.test(unpricedFeeCount))
    throw new Error(`Abyss: missing or invalid fee amounts for ${options.dateString}`);
  if (BigInt(unpricedFeeCount) !== 0n)
    throw new Error(`Abyss: incomplete fee pricing for ${options.dateString} (${unpricedFeeCount} unpriced fee amounts)`);
  const fees = BigInt(tradingFeeUsdX18);
  const lpFees = BigInt(lpFeeUsdX18);
  const revenue = BigInt(protocolRevenueUsdX18);
  if (fees !== lpFees + revenue)
    throw new Error(`Abyss: generated fees do not reconcile for ${options.dateString}`);

  const beforeDay = await options.getBlock(day - 1, options.chain, {});
  const toBlock = await options.getBlock(end - 1, options.chain, {});
  if (!Number.isSafeInteger(beforeDay) || !Number.isSafeInteger(toBlock))
    throw new Error("Abyss: unavailable daily boundary blocks");
  if (!("indexedBlock" in data) || typeof data.indexedBlock !== "string" || !/^\d+$/.test(data.indexedBlock)
    || BigInt(data.indexedBlock) < BigInt(toBlock))
    throw new Error(`Abyss: fee indexer has not completed ${options.dateString}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addUSDValue(new BigNumber(fees.toString()).dividedBy("1e18").toNumber(), FEES);
  dailySupplySideRevenue.addUSDValue(new BigNumber(lpFees.toString()).dividedBy("1e18").toNumber(), LP_FEES);
  const revenueUSD = new BigNumber(revenue.toString()).dividedBy("1e18").toNumber();
  dailyRevenue.addUSDValue(revenueUSD, REVENUE);
  dailyProtocolRevenue.addUSDValue(revenueUSD, REVENUE);

  // Adjacent daily queries are disjoint: the prior closing block is excluded.
  const distributions = await getPositionedLogArgs(options, {
    target: FEE_ROUTER, eventAbi: DISTRIBUTED, fromBlock: beforeDay + 1, toBlock,
  });
  const receiverChanges = await getPositionedLogArgs(options, {
    target: FEE_ROUTER,
    eventAbi: RECEIVER_SET,
    fromBlock: DEPLOYMENT_BLOCK,
    toBlock,
    cacheInCloud: true, // Small, infrequently changing recipient configuration, not fee events.
    maxBlockRange: 10_000_000, // Public Robinhood RPC's maximum log-query span.
  });

  distributions.sort(compareLogs);
  receiverChanges.sort(compareLogs);
  let receiver = BUYBACK_BURNER;
  let changeIndex = 0;
  for (const log of distributions) {
    while (changeIndex < receiverChanges.length && compareLogs(receiverChanges[changeIndex], log) < 0) {
      const change = receiverChanges[changeIndex++];
      if (change.oldReceiver.toLowerCase() !== receiver)
        throw new Error("Abyss: incomplete protocol recipient history");
      receiver = change.newReceiver.toLowerCase();
    }
    const protocol = BigInt(log.protocolVaultAmount);
    if (BigInt(log.amountPulled) !== BigInt(log.devAmount) + protocol)
      throw new Error("Abyss: distribution does not reconcile");
    if (receiver === BUYBACK_BURNER) {
      dailyHoldersRevenue.add(WETH, protocol.toString(), BUYBACK);
      dailyProtocolRevenue.add(WETH, (-protocol).toString(), BUYBACK);
    }
    // Reclassify existing revenue, never add distributions as new fees or revenue.
    // protocolForwarded can include unrelated router inventory; executions reuse funded WETH.
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 1, // The generated-fee API provides daily aggregates, not hourly fee data.
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-19", // Preserve the original history boundary; incomplete API days throw.
  allowNegativeValue: true, // Buyback funding can spend revenue accrued on earlier days.
  fetch,
  methodology: {
    Fees: "Swap and flash fees reported by Abyss DEX, valued when generated and including the LP and protocol shares; excludes lending and rejects incomplete fee pricing.",
    Revenue: "The share of generated swap and flash fees allocated to the protocol fee vault, before developer payments and buyback funding.",
    SupplySideRevenue: "The share of generated swap and flash fees allocated to liquidity providers.",
    ProtocolRevenue: "Generated protocol revenue less fee-vault WETH allocated to ABYSS buybacks that day, which may be negative when funding uses earlier revenue.",
    HoldersRevenue: "Fee-vault WETH allocated to the ABYSS buyback burner, measured at funding rather than execution; excludes pre-existing router balances and in-kind ABYSS distributions.",
  },
  breakdownMethodology: {
    Fees: { [FEES]: "Daily generated swap and flash fees from the protocol indexer, converting USD scaled by 10^18 to USD without treating distributions as additional fees." },
    Revenue: { [REVENUE]: "Generated trading fees allocated to the protocol fee vault, not the narrower developer share." },
    SupplySideRevenue: { [LP_FEES]: "Generated trading fees allocated to liquidity providers." },
    ProtocolRevenue: {
      [REVENUE]: "Generated fee-vault revenue before buyback attribution, including the developer share.",
      [BUYBACK]: "Fee-vault WETH allocated to ABYSS buybacks, deducted from retained protocol revenue rather than counted again.",
    },
    HoldersRevenue: { [BUYBACK]: "WETH allocated to ABYSS buybacks, counted once at the fee source, not again on execution." },
  },
};

export default adapter;
