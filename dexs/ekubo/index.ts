import ADDRESSES from '../../helpers/coreAssets.json'
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import BigNumber from "bignumber.js";

const chainConfig: Record<string, { start: string, chainId: String }> = {
  [CHAIN.STARKNET]: { start: '2023-09-19', chainId: "23448594291968334" },
  [CHAIN.ETHEREUM]: { start: '2025-01-31', chainId: "1" }
}

function toAddress(numberString: string): string {
  return numberString === '0' ? ADDRESSES.null : `0x${new BigNumber(numberString).toString(16)}`;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const chainId = chainConfig[options.chain].chainId
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0]

  const responseVolumes: any[] = (await httpGet('https://prod-api.ekubo.org/overview/volume?chainId=' + chainId)).volumeByTokenByDate
  const responseRevenue: any[] = (await httpGet('https://prod-api.ekubo.org/overview/revenue?chainId=' + chainId)).revenueByTokenByDate

  responseVolumes.filter((t) => t.date.split('T')[0] === dateStr).map((t) => {
    const token = toAddress(t.token)
    dailyVolume.add(token, t.volume)
    dailyFees.add(token, t.fees)
  })

  responseRevenue.filter((t) => t.date.split('T')[0] === dateStr).map((t) => {
    // add withdrawal fees to fees too
    dailyFees.add(toAddress(t.token), t.revenue)
    dailyRevenue.add(toAddress(t.token), t.revenue)
  })

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
    dailyProtocolRevenue: dailyRevenue,
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
