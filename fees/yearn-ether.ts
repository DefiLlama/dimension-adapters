import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { getConfig } from "../helpers/cache";
import { CHAIN } from "../helpers/chains";

const methodology = {
  Fees: 'Total swap fees paid by users from yETH pool',
  SupplySideRevenue: 'Total fees are distributed to liquidity providers',
  ProtocolRevenue: 'The amount of fees go Yearn treasury',
}

const yETHPoolOld = '0x2cced4ffa804adbe1269cdfc22d7904471abde63'
const yETHPoolNew = '0x0ca1bd1301191576bea9b9afcfd4649dd1ba6822'

const SwapFeesRate = 0.0003 // 0.03%

const ContractAbis = {
  assets: 'function assets(uint256) view returns (address)',
  SwapEvent: 'event Swap(address indexed account, address receiver, uint256 indexed asset_in, uint256 indexed asset_out, uint256 amount_in, uint256 amount_out)',
}

const CoinIndexs: Array<number> = []
for (let i = 0; i < 20; i++) {
  CoinIndexs.push(i)
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()

  const assets: {[key: string]: Array<string>} = {
    [yETHPoolOld]: await options.api.multiCall({
      abi: ContractAbis.assets,
      target: yETHPoolOld,
      calls: CoinIndexs,
      permitFailure: true,
    }),
    [yETHPoolNew]: await options.api.multiCall({
      abi: ContractAbis.assets,
      target: yETHPoolNew,
      calls: CoinIndexs,
      permitFailure: true,
    }),
  }

  for (const pool of [yETHPoolOld, yETHPoolNew]) {
    const swapEvents = await options.getLogs({
      eventAbi: ContractAbis.SwapEvent,
      target: pool,
    })
    for (const event of swapEvents) {
      dailyFees.add(assets[pool][Number(event.asset_in)], Number(event.amount_in) * SwapFeesRate)
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyProtocolRevenue: 0,
  }
}

const adapter: Adapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2023-09-07',
    },
  },
};

export default adapter;
