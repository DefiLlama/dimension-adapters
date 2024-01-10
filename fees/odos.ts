/*
Fees adapter for odos.xyz

> what?
swaps (trading) generate fees, taken in the bought token.

> how?
- swaps
  - single-swap
    - Calculate directly from the positive `slippage` param in the Swap event as raw `outputToken` amount.
  - multi-swap
    - delta (increase) of held balances of `tokensOut` in the router.
- referral comissions
  - flat 20% of referral's fee tier. each referral code has its own fee tier.
a delta comparision would cover all of the above as all kinds of fees are held inside the router.
but make sure to only consider txns excluding the `transferRouterFunds` function calls

> which?
- for now, we include only v2
- of that, we include only single swaps

> pls help!
To do:
- add v1 fees,
- add multi-swap fees,
- add fee from referrals

> notes?
- v2 started at 1699121600 (2023-jul-13)

*/

import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";
import { ethers } from "ethers";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
interface IAmount {
  feesAmount: number;
}

const event_swap = 'event Swap (address sender, uint256 inputAmount, address inputToken, uint256 amountOut, address outputToken, int256 slippage, uint32 referralCode)';
const topic0_swap_one = '0x823eaf01002d7353fbcadb2ea3305cc46fa35d799cb0914846d185ac06f8ad05';
const ROUTER_ADDRESS_FTM_V2 = '0xd0c22a5435f4e8e5770c1fafb5374015fc12f7cd';

const contract_interface = new ethers.Interface([
  event_swap
]);

type TPool = {
  [c: string]: string[];
}
const FEE_COLLECTORS: TPool = {
  [CHAIN.ETHEREUM]:     [ '0xCf5540fFFCdC3d510B18bFcA6d2b9987b0772559', ],
  [CHAIN.ARBITRUM]:     [ '0xa669e7A0d4b3e4Fa48af2dE86BD4CD7126Be4e13', ],
  [CHAIN.OPTIMISM]:     [ '0xCa423977156BB05b13A2BA3b76Bc5419E2fE9680', ],
  [CHAIN.BASE]:         [ '0x19cEeAd7105607Cd444F5ad10dd51356436095a1', ],
  [CHAIN.POLYGON]:      [ '0x4E3288c9ca110bCC82bf38F09A7b425c095d92Bf', ],
  [CHAIN.AVAX]:         [ '0x88de50B233052e4Fb783d4F6db78Cc34fEa3e9FC', ],
  [CHAIN.BSC]:          [ '0x89b8AA89FDd0507a99d334CBe3C808fAFC7d850E', ],
  [CHAIN.FANTOM]:       [ '0xd0c22a5435f4e8e5770c1fafb5374015fc12f7cd', ],
  //[CHAIN.ZKSYNC]:       [ '0x4bBa932E9792A2b917D47830C93a9BC79320E4f7', ],
  [CHAIN.POLYGON_ZKEVM]:[ '0x2b8B3f0949dfB616602109D2AAbBA11311ec7aEC', ],
}

const PAIR_TOKEN_ABI = (token: string): object => {
  return {
    "inputs": [],
    "name": token,
    "outputs": [
        {
            "internalType": "contract IERC20",
            "name": "tokenX",
            "type": "address"
        }
    ],
    "stateMutability": "pure",
    "type": "function"
  }
};


const graph = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp = timestamp
    try {
      const feeCollectors = FEE_COLLECTORS[chain];

      const fromBlock = (await getBlock(fromTimestamp, chain, {}));
      const toBlock = (await getBlock(toTimestamp, chain, {}));

      //console.log(feeCollectors,fromBlock,toBlock,chain);

      const logs: ILog[][] = (await Promise.all(feeCollectors.map((address: string) => sdk.getEventLogs({
        target: address,
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: chain,
        topics: [topic0_swap_one]
      })))) as ILog[][];

      const rawCoinsPerTreasury: string[][] = feeCollectors.map((_: string, index: number) => {
        const logsToTokenList: string[] = logs[index]
          .map((e: ILog) => { return { ...e } })
          .map((p: ILog) => {
            return `${chain}:${contract_interface.parseLog(p)!.args.outputToken}`;
          });
        return (logsToTokenList);
      });

      const rawCoins: string[] = rawCoinsPerTreasury.reduce( (a:string[], b:any) => [...a, ...b] );
      const coins = [...new Set(rawCoins)];
      const prices = await getPrices(coins, timestamp);


      const untrackVolumes: any[] = feeCollectors.map((_: string, index: number) => {
        //const token0Decimals = prices[`${chain}:${tokens0[index]}`]?.decimals || 0
        //const token1Decimals = prices[`${chain}:${tokens1[index]}`]?.decimals || 0
        const log: IAmount[] = logs[index]
          .map((e: ILog) => { return { ...e } })
          .map((p: ILog) => {
            const value = contract_interface.parseLog(p);
            const _token = value!.args.outputToken;
            const _price = (prices[`${chain}:${_token}`]?.price || 0);
            const _deci = prices[`${chain}:${_token}`]?.decimals || 0;
            const _slip = Number(value!.args.slippage);
            const feesAmount = (_slip>0?_slip:0) / 10 ** _deci * _price;
            return {
              feesAmount,
            } as IAmount
          });

        const totalFees = log.reduce((a: number, b: IAmount) => Number(b.feesAmount) + a, 0) ;
        return {
          fees: totalFees
        };
      });

      const dailyFees = untrackVolumes.reduce((a: number, b: any) => a + b.fees, 0);
      const dailyRevenue = untrackVolumes.reduce((a: number, b: any) => a + b.rev, 0);
      return {
        dailyFees: `${dailyFees}`,
        dailyRevenue: `${dailyFees}`,
        dailyHoldersRevenue: `${0}`,
        dailySupplySideRevenue: `${0}`,
        timestamp,
      };
    } catch(error) {
      console.error(error);
      throw error;
    }
  }
}



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]:     { fetch: graph(CHAIN.ETHEREUM),       start: async () => 1689292800 },
    [CHAIN.ARBITRUM]:     { fetch: graph(CHAIN.ARBITRUM),       start: async () => 1689292800 },
    [CHAIN.OPTIMISM]:     { fetch: graph(CHAIN.OPTIMISM),       start: async () => 1689292800 },
    [CHAIN.BASE]:         { fetch: graph(CHAIN.BASE),           start: async () => 1689292800 },
    [CHAIN.POLYGON]:      { fetch: graph(CHAIN.POLYGON),        start: async () => 1689292800 },
    [CHAIN.AVAX]:         { fetch: graph(CHAIN.AVAX),           start: async () => 1689292800 },
  //[CHAIN.BSC]:          { fetch: graph(CHAIN.BSC),            start: async () => 1689292800 },
    [CHAIN.FANTOM]:       { fetch: graph(CHAIN.FANTOM),         start: async () => 1689292800 },
  //[CHAIN.ZKSYNC]:       { fetch: graph(CHAIN.ZKSYNC),         start: async () => 1689292800 },
    [CHAIN.POLYGON_ZKEVM]:{ fetch: graph(CHAIN.POLYGON_ZKEVM),  start: async () => 1689292800 }
  }
};

export default adapter;