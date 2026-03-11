import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
const eventAbi = "event EvInventory(bytes32 indexed itemHash, address maker, address taker, uint256 orderSalt, uint256 settleSalt, uint256 intent, uint256 delegateType, uint256 deadline, address currency, bytes dataMask, (uint256 price, bytes data) item, (uint8 op, uint256 orderIdx, uint256 itemIdx, uint256 price, bytes32 itemHash, address executionDelegate, bytes dataReplacement, uint256 bidIncentivePct, uint256 aucMinIncrementPct, uint256 aucIncDurationSecs, (uint256 percentage, address to)[] fees) detail)"

const fetch: any = async (timestamp: number, _: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logs = await options.getLogs({ eventAbi, target: "0x74312363e45dcaba76c59ec49a7aa8a65a67eed3", topics: ['0x3cbb63f144840e5b1b0a38a7c19211d2e89de4d7c5faf8b2d3c1776c302d1d33'] });

  logs.map((p: any) => {
    const token = p.currency
    const price = Number(p.item.price);
    p.detail.fees.slice(0, 1).map((fee: any) => dailyRevenue.add(token, price * Number(fee.percentage) / 10 ** 6))
    p.detail.fees.map((fee: any) => dailyFees.add(token, price * Number(fee.percentage) / 10 ** 6))
  });

  return { timestamp, dailyFees, dailyRevenue, }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2022-12-18', },
  }
}

export default adapter;
