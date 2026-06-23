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
  pullHourly: true,
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
