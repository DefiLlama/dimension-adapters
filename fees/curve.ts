import { BaseAdapter, FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import dexAdapter from "../dexs/curve";

const LABELS = {
  CurveDEXSwapFees: 'CurveDEX Swap Fees',
  CurveDEXSwapRevenue: 'CurveDEX Admin Fees',
  CurveDEXFeesTreasury: 'CurveDEX Admin Fees To Treasury',
  CurveDEXFeesHolders: 'CurveDEX Fees To veCRV Holders',
  CurveDEXFeesLPs: 'CurveDEX Fees To LPs',
  CurveBribesRewards: 'CurveDEX Bribes Rewards',
  CurveBribesRevenue: 'CurveDEX Bribes Revenue',
}

const fetchBribesRevenue = async (options: FetchOptions) => {
  const dailyBribesRevenue = options.createBalances()

  if (options.chain !== CHAIN.ETHEREUM) {
    return dailyBribesRevenue;
  }

  // Source swapped 2026-08: the crvhub bounties file stopped updating on
  // 2026-07-11, so every day since reads as a zero delta. CurveDEX publishes
  // the same schema, rebuilt 4x/day from Votemarket (on-chain campaigns) and
  // Votium. Basis note: it counts incentives ADDED rather than claimed - field
  // names keep crvhub's spelling for compatibility, and the root carries
  // `basis` / `granularity` / `disclaimer` spelling that out.
  const stats = await fetchURL(`https://llama.box/curvedex/api/bribes/stats.json`)
  const daily: any[] = stats.claimsLast365Days?.claims ?? []
  const inception: any[] = stats.claimsSinceInception?.claims ?? []

  // Recent days: claimsLast365Days is a daily-updating cumulative total, so a
  // day's bribes = cumulative(endOfDay) - cumulative(startOfDay). Used whenever
  // the day is covered by the daily series (not entirely before it begins).
  if (daily.length && options.endTimestamp > daily[0].timestamp) {
    const closestTo = (target: number) => daily.reduce((closest, item) =>
      Math.abs(item.timestamp - target) < Math.abs(closest.timestamp - target) ? item : closest
    )
    const startOfDay = closestTo(options.startTimestamp)
    const endOfDay = closestTo(options.endTimestamp)
    dailyBribesRevenue.addUSDValue(Math.max(0, Number(endOfDay.value) - Number(startOfDay.value)))
    return dailyBribesRevenue;
  }

  // Older days fall back to claimsSinceInception, a cumulative total that only
  // steps on each (bi-)weekly claim settlement (~15-day cadence). Count the full
  // epoch delta only on the day its settlement snapshot lands; zero otherwise.
  const idx = inception.findIndex((c) => c.timestamp >= options.startTimestamp && c.timestamp < options.endTimestamp)
  if (idx >= 0) {
    const prevValue = idx > 0 ? Number(inception[idx - 1].value) : 0
    dailyBribesRevenue.addUSDValue(Math.max(0, Number(inception[idx].value) - prevValue))
  }

  return dailyBribesRevenue;
}

const baseDexAdapter = dexAdapter.adapter as BaseAdapter

const fetch = async (options: FetchOptions) => {
  const dexData: any = await (baseDexAdapter[options.chain].fetch as FetchV2)(options)
  if (!dexData) throw Error('failed to run curve-dex adapter');
  
  const dailyBribesRevenue = await fetchBribesRevenue(options)
  
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.add(dexData.dailyFees, LABELS.CurveDEXSwapFees);
  dailyFees.add(dailyBribesRevenue, LABELS.CurveBribesRewards);

  // bribes are paid by gauge-vote bidders, not by users
  const dailyUserFees = dexData.dailyFees.clone(1, LABELS.CurveDEXSwapFees);

  dailyRevenue.add(dexData.dailyRevenue, LABELS.CurveDEXSwapRevenue);
  dailyRevenue.add(dailyBribesRevenue, LABELS.CurveBribesRevenue);

  dailyHoldersRevenue.add(dexData.dailyHoldersRevenue, LABELS.CurveDEXFeesHolders);
  dailyHoldersRevenue.add(dailyBribesRevenue, LABELS.CurveBribesRevenue);
  
  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: dexData.dailyProtocolRevenue.clone(1, LABELS.CurveDEXFeesTreasury),
    dailySupplySideRevenue: dexData.dailySupplySideRevenue.clone(1, LABELS.CurveDEXFeesLPs),
  }
}

// https://resources.curve.finance/pools/overview/#pool-fees
const adapter: SimpleAdapter = {
  version: 2,
  // pullHourly: true, // curve api doesn't support hourly pull
  adapter: Object.keys(baseDexAdapter).reduce((all, chain) => {
    all[chain] = {
      fetch,
      start: baseDexAdapter[chain].start,
    }
    return all
  }, {} as any),
  methodology: {
    Fees: "Swap and liquidity fees charged by Curve pools, plus bribes paid to veCRV voters. Fee rates are set per pool - around 0.01%-0.04% on stable pools and up to a few percent on volatile pools.",
    UserFees: "Swap and liquidity fees paid by traders. Excludes bribes, which are paid by third parties bidding for gauge votes, not by users.",
    Revenue: "The share of pool fees kept by the protocol rather than paid to liquidity providers - usually half of the fee - plus bribes.",
    ProtocolRevenue: "10% of the protocol's share of pool fees, sent to the Curve DAO treasury.",
    HoldersRevenue: "90% of the protocol's share of pool fees, distributed to veCRV holders, plus all bribes.",
    SupplySideRevenue: "The share of pool fees paid to liquidity providers - usually half of the fee."
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.CurveDEXSwapFees]: 'Swap and liquidity fees charged by Curve pools',
      [LABELS.CurveBribesRewards]: 'All bribes rewards collected',
    },
    Revenue: {
      [LABELS.CurveDEXSwapRevenue]: 'Fees distributed to veCRV holders and protocol treasury',
      [LABELS.CurveBribesRevenue]: 'All bribes revenue to holders',
    },
    ProtocolRevenue: {
      [LABELS.CurveDEXFeesTreasury]: 'Fees allocated to the protocol treasury',
    },
    HoldersRevenue: {
      [LABELS.CurveDEXFeesHolders]: 'Fees distributed to veCRV governance token holders',
      [LABELS.CurveBribesRevenue]: 'All bribes revenue to holders',
    },
    SupplySideRevenue: {
      [LABELS.CurveDEXFeesLPs]: 'Fees distributed to liquidity providers',
    },
  }
}

export default adapter;
