import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL, { httpGet } from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

const toki = (n: any) => "starknet:0x" + BigInt(n).toString(16).padStart("049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7".length, "0")

const fetch = async (timestamp: number, _t: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]

  const responseVolumes = ((await fetchURL("https://mainnet-api.ekubo.org/overview/volume")).volumeByTokenByDate as any[])
    .filter((t) => t.date.split('T')[0] === dateStr)
    .map(t => ({ token: toki(t.token), vol: t.volume, fees: t.fees }))
  const responseRevenue = ((await fetchURL("https://mainnet-api.ekubo.org/overview/revenue")).revenueByTokenByDate as any[])
    .filter((t) => t.date_trunc.split('T')[0] === dateStr)
    .map(t => ({ token: toki(t.token), revenue: t.revenue }))
  
  responseVolumes.map((token) => {
    dailyVolume.add(token.token, token.vol)
  })
  responseVolumes.map((token) => {
    dailyFees.add(token.token, token.fees)
  })
  responseRevenue.map((token) => {
    // add withdrawal fees to fees too
    dailyFees.add(token.token, token.revenue)
    dailyRevenue.add(token.token, token.revenue)
  })
  
  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return {
    timestamp,
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailyProtocolRevenue: 0,
  };
}

function toAddress(numberString: string): string {
  return numberString === '0' ? ADDRESSES.null : `0x${new BigNumber(numberString).toString(16)}`;
}

const fetchEVM = async (timestamp: number, _t: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]

  const responseVolumes: any[] = (await httpGet('https://eth-mainnet-api.ekubo.org/overview/volume')).volumeByTokenByDate
  const responseRevenue: any[] = (await httpGet('https://eth-mainnet-api.ekubo.org/overview/revenue')).revenueByTokenByDate
  
  responseVolumes.filter((t) => t.date.split('T')[0] === dateStr).map((t) => {
    const token = toAddress(t.token)
    dailyVolume.add(token, t.volume)
    dailyFees.add(token, t.fees)
  })
  responseRevenue.filter((t) => t.date_trunc.split('T')[0] === dateStr).map((t) => {
    // add withdrawal fees to fees too
    dailyFees.add(toAddress(t.token), t.revenue)
    dailyRevenue.add(toAddress(t.token), t.revenue)
  })

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return {
    timestamp,
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const adapter: Adapter = {
  methodology: {
    Fees: 'Swap fees paid by users per swap.',
    Revenue: 'A partition of swap fees and withdrawal fees charged by Ekubo.',
    SupplySideRevenue: 'Amount of fees distributed to liquidity providers.',
    HoldersRevenue: 'Amount of fees used to buy back and burn EKUBO tokens on Starknet.',
    ProtocolRevenue: 'Ekubo protocol collects revenue on Ethereum.',
  },
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      start: '2023-09-19',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEVM,
      start: '2025-01-31',
    }
  }
}

export default adapter;
