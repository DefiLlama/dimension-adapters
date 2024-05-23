import {
  ChainBlocks,
  FetchOptions,
  FetchResultFees,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { fees_bribes } from "./bribes";
import { getDexFees } from "../../helpers/dexVolumeLogs";

const lphelper = "0x1f176AABA9c6e2014455E5C199afD15A70f9e34e";
const abis: any = {
  forSwaps:
    "function forSwaps(uint256 _limit, uint256 _offset) view returns ((address lp, bool stable, address token0, address token1, address factory, uint256 poolFee)[])",
};

const fetch = async (
  timestamp: number,
  _: ChainBlocks,
  fetchOptions: FetchOptions
): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;
  const forSwaps = await sdk.api2.abi.call({
    target: lphelper,
    params: [1000, 0],
    abi: abis.forSwaps,
    chain: CHAIN.ZETA,
  });
  const pools = forSwaps.map((e: any) => e.lp);
  // const pools: string[] =  [
  //   '0x22e48B354eA9806e46D18554fCC44dAe0E6c8e0a',
  //   '0x739Cd2720F35D5176EC05067739BC2533c1314a7',
  //   '0x6F685FFa223c96a2Be05C26defEF80339F0EdBce',
  //   '0x8640E4807392627a4238312920618D4c6602e7fa',
  //   '0x4cfF774c9eA4466463214d1D1a6E7492E9057440',
  //   '0x3B48FFf7Dd8b827EF300DBA5Ae79fc7a322c49Ac',
  //   '0x51a857F95D9AB60Ae2C8A0f121d15637fc046EE7',
  //   '0xD9EBfC4Ba412a0B0c9F81Ef53641f33A8ae33884',
  //   '0xB8567E77491964539E62788F2BC44B6c2092a9a9',
  //   '0x5F3b15d89Fcc91229dC0C978302151cE9a83DaA1',
  //   '0x5b031943a2cA4905cfa4E4EB7f6F940EC4c3f924',
  //   '0x542D185C63E8B04a84B53cd05B47bB11eD9f11De',
  //   '0x1F69A5376929C86B6d4802781bDDe82F18c0BbC9',
  //   '0x26FeaB16c9bC84a3f4AAaD5b3F6158d5EC012f60',
  //   '0xDC63883280F43f607B3E463f40914Aab54325da4',
  //   '0xDbeC64831fc5faEa6AbD43F1EB62b9840bb8F239',
  //   '0xa1EDc8F027223f1291912D3D5AE2867836617f1f',
  //   '0x01DbC4861D3Ab7bF2D12957eb5f0e251B20D1AdE',
  //   '0xD2C04cbb9D374C1f4108343867784Fb2bFDf5043',
  //   '0x990391699bbE5DA396e53B64FA917E89992c0A91',
  //   '0x47201Cf6ba8007631c2B7247DCF8a37786eF26B3',
  //   '0x8C0066844223C80755938623298AbbB7356AdE7c',
  //   '0x17E4d8D30f4082E1Ca224046D0Db725c505a1bA8',
  //   '0x1Aa3dB8066a555B30b4C0977F0b700a00455529D',
  //   '0x83C251B5a4DD9CEE6414069b888b0b25Ad646F7D',
  //   '0x0b0e9b5019728B543CC5B436586319E6F5946820',
  //   '0xba01Aaa4f51baB79AD26c83fA687B0D169aD7FBf',
  //   '0x7d3292145320594B48cAf8383E70d98BeEdfC90f'
  // ]

  const res: any = await getDexFees({
    chain: CHAIN.ZETA,
    fromTimestamp,
    toTimestamp,
    pools,
    timestamp,
    fetchOptions,
  });
  // const fromBlock = await getBlock(fromTimestamp, CHAIN.ZETA, {});
  // const toBlock = await getBlock(toTimestamp, CHAIN.ZETA, {});
  // const dailyBribesRevenue = await fees_bribes(fromBlock, toBlock, timestamp);
  // res.dailyBribesRevenue = dailyBribesRevenue.toString();
  // return res;
  const { dailyBribesRevenue } = await fees_bribes(fetchOptions);
  res.dailyBribesRevenue = dailyBribesRevenue
  return res
};
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ZETA]: {
      fetch: fetch,
      start: 1707177600,
    },
  },
};
export default adapters;
