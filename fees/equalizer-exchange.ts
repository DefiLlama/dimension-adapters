import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { ethers } from "ethers";

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}

interface ILog {
  data: string;
  topics: string[];
  transactionHash: string;
}
interface IAmount {
  amount0: number;
  amount1: number;
}
interface IBribeAndFeeAmount {
  amount: number;
}
interface IBribedAmount {
  amount: number;
}
interface IAmountUSD {
  amount: number;
}

const TOPIC_Fees = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
const TOPIC_NotifyRewardAmount = '0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b';
const TOPIC_Notify = 'event NotifyReward(address indexed from, address indexed reward, uint indexed epoch, uint amount)';
const INTERFACE_N = new ethers.Interface([TOPIC_Notify]);
const VOTER_ADDRESS = '0xE3D1A117dF7DCaC2eB0AC8219341bAd92f18dAC1';
const FACTORY_ADDRESS = '0xc6366EFD0AF1d09171fe0EBF32c7943BB310832a';
const CHAIN_USED = CHAIN.FANTOM;
const CHAIN_SLUG = 'fantom';

type TABI = {
  [k: string]: string;
}
const ABIs: TABI = {
  "allPairsLength": "uint256:allPairsLength",
  "allPairs": "function allPairs(uint256) view returns (address)"
}

const VOTER_ABI: TABI = {
  "length": "uint256:length",
  "pools": "function pools(uint256) view returns (address)",
  "gauges": "function gauges(address) view returns (address)",
  "bribes": "function bribes(address) view returns (address)"
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp

  const poolLength = (await sdk.api2.abi.call({
    target: FACTORY_ADDRESS,
    chain: CHAIN_SLUG,
    abi: ABIs.allPairsLength,
  }));

  const poolsRes = await sdk.api2.abi.multiCall({
    abi: ABIs.allPairs,
    target: FACTORY_ADDRESS,
    calls: Array.from(Array(Number(poolLength)).keys()),
    chain: CHAIN_SLUG
  });

  const lpTokens = poolsRes

  const [underlyingToken0, underlyingToken1] = await Promise.all(
    ['address:token0', 'address:token1'].map((method) =>
      sdk.api2.abi.multiCall({
        abi: method,
        calls: lpTokens.map((address: string) => ({
          target: address,
        })),
        chain: CHAIN_SLUG
      })
    )
  );

  const tokens0 = underlyingToken0;
  const tokens1 = underlyingToken1;


  const poolsGauges = await sdk.api2.abi.multiCall({
    abi: VOTER_ABI.gauges,
    target: VOTER_ADDRESS,
    calls: lpTokens,
    chain: CHAIN_SLUG
  });

  const voterGauges = poolsGauges.filter((_vg: string) =>
    _vg !== '0x0000000000000000000000000000000000000000'
  );



  const poolsGaugesToBribes = await sdk.api2.abi.multiCall({
    abi: VOTER_ABI.bribes,
    target: VOTER_ADDRESS,
    calls: voterGauges,
    chain: CHAIN_SLUG
  });

  const voterBribes = poolsGaugesToBribes;





  const fromBlock = (await getBlock(fromTimestamp, CHAIN_SLUG, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN_SLUG, {}));

  const tradefeeLogs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.getEventLogs({
    target: address,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN_SLUG,
    topics: [TOPIC_Fees]
  })))) as ILog[][];


  const bribeAndFeeLogs: ILog[][] = (await Promise.all(voterBribes.map((address: string) => sdk.getEventLogs({
    target: address,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN_SLUG,
    topics: [TOPIC_NotifyRewardAmount]
  })))) as ILog[][];



  var allBribedTokens: string[] = new Array(0);
  const listOfBribedTokensByPool: string[][] = bribeAndFeeLogs.map((perBribeLogs: ILog[]) => {
    const _innerBT: string[] = perBribeLogs.map((e: ILog) => {
      const _l = INTERFACE_N.parseLog(e);
      if (_l == null) { return "" }
      const _t = `${CHAIN_USED}:${_l.args.reward.toLowerCase()}`;
      return _t;
      //return `${CHAIN_USED}:${e.topics[2].toLowerCase()}`;
    });
    allBribedTokens = allBribedTokens.concat(_innerBT);
    return _innerBT;
  });

  allBribedTokens.filter((_ta: string) => { _ta != "" })






  const rawCoins = [...tokens0, ...tokens1, ...allBribedTokens].map((e: string) => `${CHAIN_SLUG}:${e}`);
  const coins = [...new Set(rawCoins)];

  // const prices = await getPrices(coins, timestamp);
  // { getPrices } function breaks above 100 tokens..splitting into chunks of 100

  const coins_split: string[][] = [];
  for (let i = 0; i < coins.length; i += 100) {
    coins_split.push(coins.slice(i, i + 100))
  }
  const prices_result: any = (await Promise.all(coins_split.map((a: string[]) => getPrices(a, timestamp)))).flat().flat().flat();
  const prices: TPrice = Object.assign({}, {});
  prices_result.map((a: any) => Object.assign(prices, a))



  const tradefees: number[] = lpTokens.map((_: string, index: number) => {
    const token0Decimals = (prices[`${CHAIN_SLUG}:${tokens0[index]}`]?.decimals || 0)
    const token1Decimals = (prices[`${CHAIN_SLUG}:${tokens1[index]}`]?.decimals || 0)
    const tradefeesLog: IAmount[] = tradefeeLogs[index]
      .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
      .map((p: ILog) => {
        const amount0 = Number('0x' + p.data.slice(0, 64)) / 10 ** token0Decimals;
        const amount1 = Number('0x' + p.data.slice(64, 128)) / 10 ** token1Decimals;
        return {
          amount0,
          amount1
        } as IAmount
      }) as IAmount[];
    const token0Price = (prices[`${CHAIN_SLUG}:${tokens0[index]}`]?.price || 0);
    const token1Price = (prices[`${CHAIN_SLUG}:${tokens1[index]}`]?.price || 0);

    const feesAmount0 = tradefeesLog
      .reduce((a: number, b: IAmount) => Number(b.amount0) + a, 0) * token0Price;
    const feesAmount1 = tradefeesLog
      .reduce((a: number, b: IAmount) => Number(b.amount1) + a, 0) * token1Price;

    const feesUSD = feesAmount0 + feesAmount1;
    return feesUSD;
  });



  const notifiedFees: number[] = voterBribes.map((_: string, index: number) => {
    const notifiedFeesLog: IAmountUSD[] = bribeAndFeeLogs[index]
      .map((e: ILog) => { return { ...e } })
      .map((p: ILog) => {
        const _log = INTERFACE_N.parseLog(p);
        if (_log == null || _log.args.from != voterGauges[index]) {
          const amount = 0;
          return { amount } as IAmountUSD
        }
        const _token = _log.args.reward;
        const _price = (prices[`${CHAIN_SLUG}:${_token}`]?.price || 0);
        const _deci = prices[`${CHAIN_SLUG}:${_token}`]?.decimals || 0;
        const amount = Number(p.data) / 10 ** _deci * _price;
        return { amount } as IAmountUSD
      }) as IAmountUSD[];

    const notifiedFeeAmount = notifiedFeesLog
      .reduce((a: number, b: IAmountUSD) => Number(b.amount) + a, 0);

    return notifiedFeeAmount;
  });




  const notifiedBribes: number[] = voterBribes.map((_: string, index: number) => {
    const bribesLog: IAmountUSD[] = bribeAndFeeLogs[index]
      .map((e: ILog) => { return { ...e } })
      .map((p: ILog) => {
        const _log = INTERFACE_N.parseLog(p);
        if (_log == null || _log.args.from == voterGauges[index]) {
          const amount = 0;
          return { amount } as IAmountUSD
        }
        const _token = _log.args.reward;
        const _price = (prices[`${CHAIN_SLUG}:${_token}`]?.price || 0);
        const _deci = prices[`${CHAIN_SLUG}:${_token}`]?.decimals || 0;
        const amount = Number(p.data) / 10 ** _deci * _price;
        return { amount } as IAmountUSD
      }) as IAmountUSD[];

    const bribedAmount = bribesLog.reduce((a: number, b: IBribedAmount) => Number(b.amount) + a, 0);

    return bribedAmount;
  });







  const dailyFees = tradefees.reduce((a: number, b: number) => a + b, 0)
  const dailyRevenueFees = notifiedFees.reduce((a: number, b: number) => a + b, 0)
  const dailyRevenueBribes = notifiedBribes.reduce((a: number, b: number) => a + b, 0)



  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenueFees}`,
    dailyHoldersRevenue: `${dailyRevenueFees}`,
    dailyBribesRevenue: `${dailyRevenueBribes}`,
    timestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: 1670544000,
    },
  }
};

export default adapter;
