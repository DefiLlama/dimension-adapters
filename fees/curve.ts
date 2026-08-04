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

  const bribes: any[] = (await fetchURL(`https://storage.googleapis.com/crvhub_cloudbuild/data/bounties/stats.json`)).claimsLast365Days.claims

  const startOfDay = bribes.reduce((closest, item) => {
    const timeDiff = (val: any) => Math.abs(val.timestamp - (options.startTimestamp - 24 * 3600))
    if (timeDiff(item) < timeDiff(closest)) {
      return item
    }
    return closest
  })

  const endOfDay = bribes.reduce((closest, item) => {
    const timeDiff = (val: any) => Math.abs(val.timestamp - (options.endTimestamp - 24 * 3600))
    if (timeDiff(item) < timeDiff(closest)) {
      return item
    }
    return closest
  })
  
  dailyBribesRevenue.addUSDValue(Number(endOfDay.value - startOfDay.value))

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
