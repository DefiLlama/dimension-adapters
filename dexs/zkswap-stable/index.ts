import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const pools = [
  {
    address: '0x15309aaf4fedf346e5204331027b4ef7b75b1dd7',
    tokens: [
      ADDRESSES.era.USDC_CIRCLE,
      ADDRESSES.era.USDC,
      ADDRESSES.era.USDT,
    ],
    fee: 0.0001, // 0.01%
  },
];

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()

  for (const pool of pools) {
    const logs = await options.getLogs({
      target: pool.address,
      eventAbi: 'event TokenExchange(address indexed buyer, uint256 sold_id, uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought)',
    })
    for (const log of logs) {
      dailyVolume.add(pool.tokens[Number(log.sold_id)], log.tokens_sold)
      dailyFees.add(pool.tokens[Number(log.sold_id)], Number(log.tokens_sold) * pool.fee)
    }
  }

  const dailyRevenue = dailyFees.clone(0.33)
  const dailySupplySideRevenue = dailyFees.clone(0.67)

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const adapters: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetch,
      start: '2024-11-06',
    }
  },
  methodology: {
    Fees: "0.01% swap fee on each trade in the stable pool.",
    UserFees: "User pays 0.01% fees on each swap.",
    Revenue: "Approximately 33% of the fees go to the protocol.",
    ProtocolRevenue: "Approximately 33% of the fees go to the protocol.",
    SupplySideRevenue: "Approximately 67% of the fees are distributed to liquidity providers.",
  }
}
export default adapters;