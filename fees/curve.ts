import { BaseAdapter, FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import dexAdapter from "../dexs/curve";
import { METRIC } from "../helpers/metrics";

const fetchBribesRevenue = async (options: FetchOptions) => {
  if (options.chain !== CHAIN.ETHEREUM) {
    return 0
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

  return (endOfDay.value - startOfDay.value).toString()
}

const baseDexAdapter = dexAdapter.adapter as BaseAdapter

const fetch = async (options: FetchOptions) => {
  const dexData = await (baseDexAdapter[options.chain].fetch as FetchV2)(options)
  const dailyBribesRevenue = await fetchBribesRevenue(options)

  return {
    ...dexData,
    dailyBribesRevenue,
  }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Trading and liquidity fees paid by users when swapping tokens in Curve pools, typically 0.01%-0.04% per trade"
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Trading and liquidity fees paid by users when swapping tokens"
  },
  Revenue: {
    "Admin fees to veCRV holders": "Admin fee portion distributed to veCRV governance token holders, typically 50% of swap fees",
    "Admin fees to treasury": "Admin fee portion allocated to the protocol treasury"
  },
  ProtocolRevenue: {
    "Treasury fees": "Admin fees allocated to the Curve DAO treasury"
  },
  HoldersRevenue: {
    "veCRV staking rewards": "Admin fees distributed to veCRV holders through the fee distributor contract",
    "Governance bribes": "Incentive payments from external protocols to veCRV holders for voting on gauge weights (Ethereum only)"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Portion of swap fees that remains in pools and is distributed to liquidity providers, typically 50% of swap fees"
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: dexAdapter.methodology,
  breakdownMethodology,
  adapter: Object.keys(baseDexAdapter).reduce((all, chain) => {
    all[chain] = {
      fetch,
      start: baseDexAdapter[chain].start,
    }
    return all
  }, {} as any)
}

export default adapter;
