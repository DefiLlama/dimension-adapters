import { Chain } from "@defillama/sdk/build/general"
import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"

const abis = {
  "FundsDeposited": "event FundsDeposited(uint256 amount, uint256 originChainId, uint256 indexed destinationChainId, int64 relayerFeePct, uint32 indexed depositId, uint32 quoteTimestamp, address originToken, address recipient, address indexed depositor, bytes message)",
  "FilledRelay": "event FilledRelay(uint256 amount, uint256 totalFilledAmount, uint256 fillAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint256 destinationChainId, int64 relayerFeePct, int64 realizedLpFeePct, uint32 indexed depositId, address destinationToken, address relayer, address indexed depositor, address recipient, bytes message, (address recipient, bytes message, int64 relayerFeePct, bool isSlowRelay, int256 payoutAdjustmentPct) updatableRelayData)"
}
const topic0_fund_disposit_v2 = '0xafc4df6845a4ab948b492800d3d8a25d538a102a2bc07cd01f1cfa097fddcff6';
const topic0_filled_replay_v2 = '0x8ab9dc6c19fe88e69bc70221b339c84332752fdd49591b7c51e66bae3947b73c';


const address: any = {
  [CHAIN.ETHEREUM]: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
  [CHAIN.ARBITRUM]: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A',
  [CHAIN.OPTIMISM]: '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
  [CHAIN.POLYGON]: '0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096'
}

const graph = (chain: Chain) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances()
    const logs_fund_disposit = (await getLogs({
      target: address[chain],
      eventAbi: abis.FundsDeposited,
      topic: topic0_fund_disposit_v2,
    })).filter((a: any) => Number(a!.destinationChainId) === 288)

    const logs_filled_replay = (await getLogs({
      target: address[chain],
      eventAbi: abis.FilledRelay,
      topic: topic0_filled_replay_v2,
    }))

    logs_fund_disposit.map((a: any) => dailyFees.add(a.originToken, Number(a.amount * a.relayerFeePct) / 1e18));
    logs_filled_replay.map((a: any) => dailyFees.add(a.destinationToken, Number(a.amount) * Number(a.relayerFeePct + a.realizedLpFeePct) / 1e18))
    return {
      dailyFees,
      dailySupplySideRevenue: dailyFees,
      timestamp
    }
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: 1682840443,
    },
    [CHAIN.ARBITRUM]: {
      fetch: graph(CHAIN.ARBITRUM),
      start: 1682840443,
    },
    [CHAIN.OPTIMISM]: {
      fetch: graph(CHAIN.OPTIMISM),
      start: 1682840443,
    },
    [CHAIN.POLYGON]: {
      fetch: graph(CHAIN.POLYGON),
      start: 1682840443,
    },
  }
};

export default adapter;
