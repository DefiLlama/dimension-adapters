import { getTokenTransfers } from "@defillama/sdk/build/util/indexer";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const USR = '0x66a1e37c9b0eaddca17d3662d6c05f4decf3e110';
const ST_USR = '0x6c8984bc7DBBeDAf4F6b2FD766f16eBB7d10AAb4';
const WST_USR = '0x1202F5C7b4B9E47a1A484E8B270be34dbbC75055';
const RLP = '0x4956b52aE2fF65D74CA2d61207523288e4528f96';
const RLP_ORACLE = '0xaE2364579D6cB4Bbd6695846C1D595cA9AF3574d';
const FEE_COLLECTOR = '0x6E02e225329E32c854178d7c865cF70fE1617f02';

const ADDRESSES_FROM = [
  '0x91eda28735ce089a8b5133476263c3fb8303c8ca',
  '0xecd04dba7bf26f726f0e58f7f9e963373317c02f',
  '0x6db24ee656843e3fe03eb8762a54d86186ba6b64',
  '0xcd531ae9efcce479654c4926dec5f6209531ca7b',
];

const ASSETS = [
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  '0x8f08b70456eb22f6109f57b8fafe862ed28e6040',
  '0x66a1e37c9b0eaddca17d3662d6c05f4decf3e110'
]

const WST_USR_ABI = 'function convertToAssets(uint256 _wstUSRAmount) external view returns (uint256 usrAmount)';

const methodology = {
  Fees: 'Total investment yields from backing assets for RLP and USR',
  Revenue: 'Protocol share of daily yield (profit) which was actived from Aug 2025',
  ProtocolRevenue: 'Protocol share of daily yield (profit) which was actived from Aug 2025',
  HoldersRevenue: 'No revenue share to RESOLV token holders',
};

const breakdownMethodology = {
  Fees: { [METRIC.ASSETS_YIELDS]: 'Total investment yields from backing assets for RLP and USR' },
  Revenue: { [METRIC.ASSETS_YIELDS]: 'Protocol share of daily yield (profit) which was actived from Aug 2025' },
  ProtocolRevenue: { [METRIC.ASSETS_YIELDS]: 'Protocol share of daily yield (profit) which was actived from Aug 2025' },
};

const getOtherRevenues = async (options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([options.getStartBlock(), options.api.getBlock()])

  return getTokenTransfers({
    chain: options.chain,
    target: FEE_COLLECTOR,
    fromAddressFilter: ADDRESSES_FROM,
    tokens: ASSETS,
    fromBlock,
    toBlock,
  })
}

const fetch = async (options: FetchOptions) => {
  const totalSupply = await options.api.multiCall({ abi: 'uint256:totalSupply', calls: [ST_USR, RLP] });
  const [stUsrSupply, rlpSupply] = totalSupply.map(v => v / 1e18);

  const [rlpPriceYesterday, rlpPriceToday, wstPriceYesterday, wstPriceToday] = await Promise.all([
    options.fromApi.call({ abi: 'uint256:lastPrice', target: RLP_ORACLE }),
    options.api.call({ abi: 'uint256:lastPrice', target: RLP_ORACLE }),
    options.fromApi.call({ abi: WST_USR_ABI, target: WST_USR, params: ['1000000000000000000'] }),
    options.api.call({ abi: WST_USR_ABI, target: WST_USR, params: ['1000000000000000000'] }),
  ])

  const dailyYield = ((((rlpPriceToday - rlpPriceYesterday) * rlpSupply) + ((wstPriceToday - wstPriceYesterday) * stUsrSupply))) / 1e18;

  // https://resolv.xyz/blog/closing-the-loop-activating-resolv-s-protocol-fee
  let revenueRatio = 0
  if (options.startOfDay < 1754006400) revenueRatio = 0           // before 01 Aug 2025, no revenue
  else if (options.startOfDay < 1754611200) revenueRatio = 0.025  // 2.5%
  else if (options.startOfDay < 1755216000) revenueRatio = 0.05   // 5%
  else if (options.startOfDay < 1755907200) revenueRatio = 0.075  // 7.5%
  else revenueRatio = 0.1                                         // 10%

  const dailyFees = options.createBalances()

  dailyFees.addUSDValue(dailyYield / (1 - revenueRatio), METRIC.ASSETS_YIELDS)

  const coreRevenue = dailyFees.clone(revenueRatio, METRIC.ASSETS_YIELDS)

  const dailyRevenue = coreRevenue.clone(1, METRIC.ASSETS_YIELDS)

  const otherRevenuesLogs = await getOtherRevenues(options)
  otherRevenuesLogs.forEach(({ token, value }: { token: string, value: string }) => {
    dailyRevenue.add(token, value, METRIC.ASSETS_YIELDS)
  })

  // 2025-03-19 RESOLV was deployed on Ethereum
  const dailyHoldersRevenue = options.startOfDay >= 1742342400 ? 0 : undefined
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2024-09-02'
};

export default adapter;
