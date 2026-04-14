import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
// import { getUniV2LogAdapter } from "../helpers/uniswap";
import request from 'graphql-request'


async function fetch({ getFromBlock, getToBlock, }: FetchOptions) {
  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  const query = (block: any) => `
    query {
  pancakeFactory(id: "0xf1cbfb1b12408dedba6dcd7bb57730baef6584fb" block:{ number: ${block}}) {
    totalVolumeUSD  }    }
  `;
  const endpoint = 'https://subgraph.okiedokie.fun/subgraphs/name/okieswap-v2';
  const endRes = await request(endpoint, query(toBlock));
  const startRes = await request(endpoint, query(fromBlock));

  const dailyVolume = endRes.pancakeFactory.totalVolumeUSD - startRes.pancakeFactory.totalVolumeUSD
  const dailyFees = dailyVolume * 0.0025; // 0.25% fees
  const dailyRevenue = dailyVolume * (0.08 / 100); // 0.08% of the volume
  const dailySupplySideRevenue = dailyFees - dailyRevenue; // 0.25% - 0.08% = 0.17% goes to LPs
  const dailyProtocolRevenue = dailyRevenue; // 0.08% goes to the protocol

  return { dailyVolume, dailyFees, dailySupplySideRevenue, dailyProtocolRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  // fetch: getUniV2LogAdapter({ factory: '0xF1cBfB1b12408dEDbA6Dcd7BB57730bAef6584fB', userFeesRatio: 1, fees: 0.25 / 100, revenueRatio: 1 / 3, protocolRevenueRatio: 1 / 3, }),
  chains: [CHAIN.XLAYER],
  start: '2025-08-17',
}

export default adapter;
