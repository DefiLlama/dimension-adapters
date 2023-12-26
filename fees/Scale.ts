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

const TOPIC_Fees = '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';
const TOPIC_Notif = '0x52977ea98a2220a03ee9ba5cb003ada08d394ea10155483c95dc2dc77a7eb24b';
const TOPIC_Notify = 'event NotifyReward(address indexed from, address indexed reward, uint indexed epoch, uint amount)';
const INTERFACE_N = new ethers.utils.Interface([TOPIC_Notify]);
const FACTORY_ADDRESS = '0xEd8db60aCc29e14bC867a497D94ca6e3CeB5eC04';
const VOTER_ADDRESS = '0x46ABb88Ae1F2a35eA559925D99Fdc5441b592687';

type TABI = {
  [k: string]: object;
}
const FACTORY_ABI: TABI = {
  allPairsLength: {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ],
    "name": "allPairsLength",
    "inputs": []
  },
  allPairs: {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "inputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ],
    "name": "allPairs",
  }
};

const VOTER_ABI: TABI = {
  length: {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ],
    "name": "length",
    "inputs": []
  },
  pools: {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "inputs": [
      {
        "type": "uint256",
        "name": "",
        "internalType": "uint256"
      }
    ],
    "name": "pools",
  },
  gauges: {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "inputs": [
      {
        "type": "address",
        "name": "",
        "internalType": "address"
      }
    ],
    "name": "gauges",
  },
  bribes: {
    "type": "function",
    "stateMutability": "view",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "inputs": [
      {
        "type": "address",
        "name": "",
        "internalType": "address"
      }
    ],
    "name": "bribes",
  }
};

const PAIR_TOKEN_ABI = (token: string): object => {
  return {
    "constant": true,
    "inputs": [],
    "name": token,
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
};


const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  try {

  /////////////////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////         TRADE FEES ONLY             ////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////////////////////////

    const poolLength = (await sdk.api.abi.call({
      target: FACTORY_ADDRESS,
      chain: 'base',
      abi: FACTORY_ABI.allPairsLength,
    })).output;

    const poolsRes = await sdk.api.abi.multiCall({
      abi: FACTORY_ABI.allPairs,
      calls: Array.from(Array(Number(poolLength)).keys()).map((i) => ({
        target: FACTORY_ADDRESS,
        params: i,
      })),
      chain: 'base'
    });

    const lpTokens = poolsRes.output
      .map(({ output }: any) => output);

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api.abi.multiCall({
          abi: PAIR_TOKEN_ABI(method),
          calls: lpTokens.map((address: string) => ({
            target: address,
          })),
          chain: 'base'
        })
      )
    );

    const tokens0 = underlyingToken0.output.map((res: any) => res.output);
    const tokens1 = underlyingToken1.output.map((res: any) => res.output);




    const poolsGauges = await sdk.api.abi.multiCall({
      abi: VOTER_ABI.gauges,
      calls: lpTokens.map((_lpt: string) => ({
        target: VOTER_ADDRESS,
        params: _lpt,
      })),
      chain: 'base'
    });



    const voterGauges = poolsGauges.output
      .map(({ output }: any) => output)
      .filter( (_vg: string) => _vg !== '0x0000000000000000000000000000000000000000');


    const poolsGaugesBribes = await sdk.api.abi.multiCall({
      abi: VOTER_ABI.bribes,
      calls: voterGauges.map((_ga: string) => ({
        target: VOTER_ADDRESS,
        params: _ga,
      })),
      chain: 'base'
    });
    const voterBribes = poolsGaugesBribes.output
      .map(({ output }: any) => output);









    const fromBlock = (await getBlock(fromTimestamp, 'base', {}));
    const toBlock = (await getBlock(toTimestamp, 'base', {}));

    const tradefeeLogs: ILog[][] = (await Promise.all(lpTokens.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: 'base',
      topics: [TOPIC_Fees]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output);

    const bribeAndFeeLogs: ILog[][] = (await Promise.all(voterBribes.map((address: string) => sdk.api.util.getLogs({
      target: address,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: 'base',
      topics: [TOPIC_Notif]
    }))))
      .map((p: any) => p)
      .map((a: any) => a.output);




    var allBribedTokens: string[] = new Array(0);
    const listOfBribedTokensByPool: string[][] = bribeAndFeeLogs.map( (perBribeLogs: ILog[]) => {
      const _innerBT: string[] = perBribeLogs.map( (e: ILog) => {
        const _l = INTERFACE_N.parseLog(e);
        const _t = `${CHAIN.BASE}:${_l.args.reward.toLowerCase()}`;
        return _t;
        //return `${CHAIN.BASE}:${e.topics[2].toLowerCase()}`;
      });
      allBribedTokens = allBribedTokens.concat(_innerBT);
      return _innerBT;
    });






    ///const rawCoins = [...tokens0, ...tokens1, ...allBribedTokens].map((e: string) => `base:${e}`);
    ///const coins = [...new Set(rawCoins)]
    ///const prices = await getPrices(coins, timestamp);

    const rawCoins = [...tokens0, ...tokens1, ...allBribedTokens].map((e: string) => `base:${e}`);
    const coins = [...new Set(rawCoins)];

    // { getPrices } function breaks above 100 tokens
    const coins_split: string[][] = [];
    for(let i = 0; i < coins.length; i+=100) {
      coins_split.push(coins.slice(i, i + 100))
    }

    const prices_result: any =  (await Promise.all(coins_split.map((a: string[]) =>  getPrices(a, timestamp)))).flat().flat().flat();
    const prices: TPrice = Object.assign({}, {});
    prices_result.map((a: any) => Object.assign(prices, a))






    const tradefees: number[] = lpTokens.map((_: string, index: number) => {
      const token0Decimals = (prices[`base:${tokens0[index]}`]?.decimals || 0)
      const token1Decimals = (prices[`base:${tokens1[index]}`]?.decimals || 0)
      const tradefeesLog: IAmount[] = tradefeeLogs[index]
        .map((e: ILog) => { return { ...e, data: e.data.replace('0x', '') } })
        .map((p: ILog) => {
          const amount0 = Number('0x' + p.data.slice(0, 64)) / 10 ** token0Decimals;
          const amount1 = Number('0x' + p.data.slice(64, 128)) / 10 ** token1Decimals
          return {
            amount0,
            amount1
          } as IAmount
        }) as IAmount[];
      const token0Price = (prices[`base:${tokens0[index]}`]?.price || 0);
      const token1Price = (prices[`base:${tokens1[index]}`]?.price || 0);

      const feesAmount0 = tradefeesLog
        .reduce((a: number, b: IAmount) => Number(b.amount0) + a, 0)  * token0Price;
      const feesAmount1 = tradefeesLog
        .reduce((a: number, b: IAmount) => Number(b.amount1) + a, 0)  * token1Price;

      const feesUSD = feesAmount0 + feesAmount1;
      return feesUSD;
    });




    const bribesAndFees: number[] = voterBribes.map((_: string, index: number) => {
      const bribeAndFeesLog: IBribeAndFeeAmount[] = bribeAndFeeLogs[index]
        .map((e: ILog) => { return { ...e } })
        .map((p: ILog) => {
          const _log = INTERFACE_N.parseLog(p);
          const _token = _log.args.reward;
          const _price = (prices[`base:${_token}`]?.price || 0);
          const _deci = prices[`base:${_token}`]?.decimals || 0;
          const amount = Number(p.data) / 10 ** _deci * _price;
          return {
            amount
          } as IBribeAndFeeAmount
        }) as IBribeAndFeeAmount[];

      const bribeAndFeeAmount = bribeAndFeesLog
        .reduce((a: number, b: IBribeAndFeeAmount) => Number(b.amount) + a, 0);



      return bribeAndFeeAmount;
    });





    const dailyTradeFees = tradefees.reduce((a: number, b: number) => a+b,0)
    const dailyBribeAndFeesRevenue = bribesAndFees.reduce((a: number, b: number) => a+b,0)
    return {
      // Should be ALL of Trade Fees
      dailyFees: `${dailyTradeFees}`,
      dailyUserFees: `${dailyTradeFees}`,
      dailySupplySideRevenue: `${dailyTradeFees}`,

      /*
      /// Old Approach
      //Should be ONLY A PART of Trade Fees. Liquidity providers earn ALL trade fees but may chose to forfeit these to earn higher emissions. Such forfeited fees are paid to holders as Revenue. But we dont have the exact number with us, since Equalizer makes no discrimination based on source for Revenue. So we'll use the full trade fee as a placecholder for now.
      ///dailyRevenue:  `${dailyTradeFees}`,
      ///dailyHoldersRevenue: `${dailyTradeFees}`,

      //Defillama doesnt include Bribes into Revenue natively and counts them separately. Since we cant discern Forfeited Trade-fee from External Bribes, we use the difference here. Ideally, `dailyBribeAndFeesRevenue` should be treated as Revenue. Til then, we might see negative numbers here if some of the forfeited fee is unclaimed during the day
      ///dailyBribesRevenue: `${dailyBribeAndFeesRevenue - dailyTradeFees}`,

      const methodology = { // for above approach
        UserFees: "Equalizer users pay a Trading fee on each swap. Includes Flash Loan Fees.",
        Fees: "Same as user-paid trade Fees",
        Revenue: "Trading fee Forfeited by some Liquidity providers, paid to veSCALE voters. Dont include Bribes unless indicated by DefiLlama toggles.",
        ProtocolRevenue: "A % of Revenue is collected by Equalizer Treasury. Never includes Bribes.",
        HoldersRevenue: "The Revenue paid to veSCALE voters. Does not include Bribes unless indicated by DefiLlama toggles.",
        SupplySideRevenue: "100% of trading fees is paid to liquidity providers. They may chose to forfeit these to earn higher emissions.",
        BribesRevenue: "100% of Bribes are paid to veSCALE voters."
      }
      */

      // New Approach
      // We define Revenue as Bribe + Forfeited Trade Fees, while the `Fees` numbers are Pure Trade Fees. This is true in the truest sense, since at contract level, there is no way to differentiate trade fee and external bribes, both are added in the same contract call. Both have an inherent overlap, which wasnt possible to highlight with old approach. Further, the old approach caused Negative `BribeRevenue` numbers over some days while in reality those were just delayed claims. So fee is raw fee, and revenue is real revenue really paid indistinguishabe with the forfeited trade fees of LPs. The Trade Fees earned directly by LPs is NOT counted in Revenue, which is correct.
      dailyRevenue:  `${dailyBribeAndFeesRevenue}`,
      dailyHoldersRevenue: `${dailyBribeAndFeesRevenue}`,
      timestamp,
    };
  } catch(error) {
    console.error(error);
    throw error;
  }
}

const methodology = {
  UserFees: "Equalizer users pay a Trading fee on each swap. Includes Flash Loan Fees.",
  Fees: "Sum of all Trading fees, including Flash Loan fees.",
  Revenue: "Trading fee Forfeited by some Liquidity providers, as well as Externally-added Bribes, paid to veSCALE voters.",
  ProtocolRevenue: "A % of Forfeited trade-fee is collected by Equalizer Treasury. Never includes Bribes.",
  HoldersRevenue: "The Revenue paid to veSCALE voters, Bribes+Forfeited trade fees.",
  SupplySideRevenue: "100% of trading fees is paid to Liquidity providers.",
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: async () => 1695458888,
      //meta: { methodology }
    },
  }
};

export default adapter;
