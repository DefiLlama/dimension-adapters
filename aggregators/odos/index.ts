
import {  FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
  [CHAIN.ERA]: ['0x4bBa932E9792A2b917D47830C93a9BC79320E4f7',],
  [CHAIN.MODE]: ['0x7E15EB462cdc67Cf92Af1f7102465a8F8c784874',],
  [CHAIN.LINEA]: ['0x2d8879046f1559E53eb052E949e9544bCB72f414',],
  [CHAIN.MANTLE]: ['0xD9F4e85489aDCD0bAF0Cd63b4231c6af58c26745',],
  [CHAIN.SCROLL]: ['0xbFe03C9E20a9Fc0b37de01A172F207004935E0b1',],
  [CHAIN.FRAXTAL]: ['0x56c85a254DD12eE8D9C04049a4ab62769Ce98210'],
  [CHAIN.SONIC]: ['0xaC041Df48dF9791B0654f1Dbbf2CC8450C5f2e9D'],
}

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const feeCollectors = FEE_COLLECTORS[chain];
  const dailyVolume = createBalances()
  const logs = await getLogs({ targets: feeCollectors, eventAbi: event_swap, })
  const multiswapLogs = await getLogs({ targets: feeCollectors, eventAbi: event_multiswap, })
  logs.forEach(i => dailyVolume.add(i.outputToken, i.amountOut))
  multiswapLogs.forEach(i => dailyVolume.add(i.tokensOut, i.amountsOut))

  return { dailyVolume, };
}

const start = 1689292800
const adapter: SimpleAdapter = { adapter: {}, version: 2, };
Object.keys(FEE_COLLECTORS).forEach((chain) => adapter.adapter[chain] = { fetch, start, });

export default adapter;
