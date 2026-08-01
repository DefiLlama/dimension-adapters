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

  const stats = await fetchURL(`https://storage.googleapis.com/crvhub_cloudbuild/data/bounties/stats.json`)
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

  dailyRevenue.add(dexData.dailyRevenue, LABELS.CurveDEXSwapRevenue);
  dailyRevenue.add(dailyBribesRevenue, LABELS.CurveBribesRevenue);

  dailyHoldersRevenue.add(dexData.dailyHoldersRevenue, LABELS.CurveDEXFeesHolders);
  dailyHoldersRevenue.add(dailyBribesRevenue, LABELS.CurveBribesRevenue);
  
  return {
    dailyFees,
    dailyUserFees: dailyFees,
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
    Fees: "Trading and liquidity fees from Curve pools (typically 0.01%-0.04%)",
    UserFees: "Trading and liquidity fees paid by users",
    Revenue: "Fees distributed to veCRV holders and protocol treasury",
    ProtocolRevenue: "Fees allocated to the protocol treasury",
    HoldersRevenue: "Fees distributed to veCRV governance token holders",
    SupplySideRevenue: "Fees distributed to liquidity providers"
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.CurveDEXSwapFees]: 'Trading and liquidity fees from Curve pools (typically 0.01%-0.04%)',
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
