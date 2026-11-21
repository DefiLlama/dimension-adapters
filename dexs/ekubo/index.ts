import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

const chainConfig: Record<string, { start: string, chainId: String }> = {
  [CHAIN.STARKNET]: { start: '2023-09-19', chainId: "23448594291968334" },
  [CHAIN.ETHEREUM]: { start: '2025-01-31', chainId: "1" },
  [CHAIN.ROBINHOOD]: { start: '2026-07-21', chainId: "4663" },
}

const DELAY_SECONDS = 2 * 60 * 60

function toAddress(numberString: string, chain: string): string {
  const hex = new BigNumber(numberString).toString(16)
  if (hex === '0') return ADDRESSES.null
  return chain === CHAIN.STARKNET ? `0x${hex}` : `0x${hex.padStart(40, '0')}`
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const chainId = chainConfig[options.chain].chainId
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]

  // Some stored days hold only part of the day. Wait a couple of hours after the day ends, and skip the CDN copy:
  // the API sends `cache-control: public, max-age=600, stale-while-revalidate=86400`, so a cached copy can be up to
  // a day old. A query param that changes every 10 minutes gets a fresh response.
  if (options.endTimestamp > Date.now() / 1e3 - DELAY_SECONDS)
    throw new Error(`ekubo: waiting until ${DELAY_SECONDS / 3600}h after ${dateStr} ends, the API may not have the whole day yet`)
  const cacheBust = Math.floor(Date.now() / 600_000)
  const responseVolumes: any[] = (await httpGet(`https://prod-api.ekubo.org/overview/volume?chainId=${chainId}&t=${cacheBust}`)).volumeByTokenByDate
  const responseRevenue: any[] = (await httpGet(`https://prod-api.ekubo.org/overview/revenue?chainId=${chainId}&t=${cacheBust}`)).revenueByTokenByDate

  // The API serves a rolling window of about 31 days and its first day is cut short, so that day and anything
  // older would otherwise come back partial or 0.
  const firstDate = [...responseVolumes, ...responseRevenue].map((t) => t.date.split('T')[0]).sort()[0]
  if (!firstDate || dateStr <= firstDate)
    throw new Error(`ekubo: the API has no full day of data for ${dateStr} (its first day is ${firstDate})`)

  responseVolumes.filter((t) => t.date.split('T')[0] === dateStr).map((t) => {
    const token = toAddress(t.token, options.chain)
    dailyVolume.add(token, t.volume)
    dailyFees.add(token, t.fees)
  })

  responseRevenue.filter((t) => t.date.split('T')[0] === dateStr).map((t) => {
    // add withdrawal fees to fees too
    dailyFees.add(toAddress(t.token, options.chain), t.revenue)
    dailyRevenue.add(toAddress(t.token, options.chain), t.revenue)
  })

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: options.chain === CHAIN.STARKNET ? dailyRevenue : undefined,
    dailyProtocolRevenue: options.chain === CHAIN.ETHEREUM ? dailyRevenue : undefined,
  };
}

const methodology = {
  Fees: 'Swap fees paid by users per swap.',
  Revenue: 'A partition of swap fees and withdrawal fees charged by Ekubo.',
  SupplySideRevenue: 'Amount of fees distributed to liquidity providers.',
  HoldersRevenue: 'Amount of fees used to buy back and burn EKUBO tokens on Starknet.',
  ProtocolRevenue: 'Ekubo protocol collects revenue on Ethereum.',
}

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
}

export default adapter;
