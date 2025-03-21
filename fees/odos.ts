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

import { ChainBlocks, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const event_swap = 'event Swap (address sender, uint256 inputAmount, address inputToken, uint256 amountOut, address outputToken, int256 slippage, uint32 referralCode)';
const event_multiswap = 'event SwapMulti(address sender, uint256[] amountsIn, address[] tokensIn, uint256[] amountsOut, address[] tokensOut, uint32 referralCode)';

type TPool = {
  [c: string]: string[];
}
const FEE_COLLECTORS: TPool = {
  [CHAIN.ETHEREUM]: ['0xCf5540fFFCdC3d510B18bFcA6d2b9987b0772559',],
  [CHAIN.ARBITRUM]: ['0xa669e7A0d4b3e4Fa48af2dE86BD4CD7126Be4e13',],
  [CHAIN.OPTIMISM]: ['0xCa423977156BB05b13A2BA3b76Bc5419E2fE9680',],
  [CHAIN.BASE]: ['0x19cEeAd7105607Cd444F5ad10dd51356436095a1',],
  [CHAIN.POLYGON]: ['0x4E3288c9ca110bCC82bf38F09A7b425c095d92Bf',],
  [CHAIN.AVAX]: ['0x88de50B233052e4Fb783d4F6db78Cc34fEa3e9FC',],
  [CHAIN.BSC]: ['0x89b8AA89FDd0507a99d334CBe3C808fAFC7d850E',],
  [CHAIN.FANTOM]: ['0xd0c22a5435f4e8e5770c1fafb5374015fc12f7cd',],
  [CHAIN.ERA]: [ '0x4bBa932E9792A2b917D47830C93a9BC79320E4f7', ],
  [CHAIN.MODE]: ['0x7E15EB462cdc67Cf92Af1f7102465a8F8c784874',],
  [CHAIN.LINEA]: ['0x2d8879046f1559E53eb052E949e9544bCB72f414',],
  [CHAIN.MANTLE]: ['0xD9F4e85489aDCD0bAF0Cd63b4231c6af58c26745',],
  [CHAIN.SCROLL]: ['0xbFe03C9E20a9Fc0b37de01A172F207004935E0b1',],
  [CHAIN.FRAXTAL]: ['0x56c85a254DD12eE8D9C04049a4ab62769Ce98210'],
  [CHAIN.SONIC]: ['0xaC041Df48dF9791B0654f1Dbbf2CC8450C5f2e9D'],
}

const graph = (chain: Chain): any => {
  return async (timestamp: number, _: ChainBlocks, { getLogs, createBalances, }: FetchOptions): Promise<FetchResultFees> => {
    const feeCollectors = FEE_COLLECTORS[chain];
    const dailyFees = createBalances()
    const logs = await getLogs({ targets: feeCollectors, eventAbi: event_swap, })
    const multiswapLogs = await getLogs({ targets: feeCollectors, eventAbi: event_multiswap, })
    logs.forEach(i => dailyFees.add(i.outputToken, Number(i.slippage) > 0 ? i.slippage : 0))
    multiswapLogs.forEach(i => dailyFees.add(i.tokensOut, i.amountsOut.map((a: any) => Number(a) * .01/100))) // 0.01% fixed fee

    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyFees,
      dailyHoldersRevenue: 0,
      dailySupplySideRevenue: 0,
      timestamp,
    };
  }
}



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: graph(CHAIN.ETHEREUM), start: '2023-07-14' },
    [CHAIN.ARBITRUM]: { fetch: graph(CHAIN.ARBITRUM), start: '2023-07-14' },
    [CHAIN.OPTIMISM]: { fetch: graph(CHAIN.OPTIMISM), start: '2023-07-14' },
    [CHAIN.BASE]: { fetch: graph(CHAIN.BASE), start: '2023-07-14' },
    [CHAIN.POLYGON]: { fetch: graph(CHAIN.POLYGON), start: '2023-07-14' },
    [CHAIN.AVAX]: { fetch: graph(CHAIN.AVAX), start: '2023-07-14' },
    [CHAIN.BSC]: { fetch: graph(CHAIN.BSC), start: '2023-07-14' },
    [CHAIN.FANTOM]: { fetch: graph(CHAIN.FANTOM), start: '2023-07-14' },
    [CHAIN.ERA]: { fetch: graph(CHAIN.ERA), start: '2023-07-14' },
    [CHAIN.MODE]: { fetch: graph(CHAIN.MODE), start: '2023-07-14' },
    [CHAIN.LINEA]: { fetch: graph(CHAIN.LINEA), start: '2023-07-14' },
    [CHAIN.MANTLE]: { fetch: graph(CHAIN.MANTLE), start: '2023-07-14' },
    [CHAIN.SCROLL]: { fetch: graph(CHAIN.SCROLL), start: '2023-07-14' },
    [CHAIN.FRAXTAL]: { fetch: graph(CHAIN.FRAXTAL), start: '2023-07-14' },
    [CHAIN.SONIC]: { fetch: graph(CHAIN.SONIC), start: '2023-07-14' },
  }
};

export default adapter;
