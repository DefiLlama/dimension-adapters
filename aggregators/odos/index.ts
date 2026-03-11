
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const event_swap = 'event Swap (address sender, uint256 inputAmount, address inputToken, uint256 amountOut, address outputToken, int256 slippage, uint32 referralCode)';
const event_multiswap = 'event SwapMulti(address sender, uint256[] amountsIn, address[] tokensIn, uint256[] amountsOut, address[] tokensOut, uint32 referralCode)';

const ODOS_ROUTER_V3 = "0x0D05a7D3448512B78fa8A9e46c4872C88C4a0D05"

const event_swap_v3 = 'event Swap (address sender, uint256 inputAmount, address inputToken, uint256 amountOut, address outputToken, int256 slippage, uint64 referralCode, uint64 referralFee, address referralFeeRecipient)';
const event_multiswap_v3 = 'event SwapMulti(address sender, uint256[] amountsIn, address[] tokensIn, uint256[] amountsOut, address[] tokensOut, int256[] slippage, uint64 referralCode, uint64 referralFee, address referralFeeRecipient)';

type TPool = {
  [c: string]: string[];
}
const ODOS_V2_ROUTERS: TPool = {
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
  [CHAIN.UNICHAIN]: ['0x6409722F3a1C4486A3b1FE566cBDd5e9D946A1f3'],
}

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const routers = ODOS_V2_ROUTERS[chain];

  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  const logs = await getLogs({ targets: routers, eventAbi: event_swap, })
  const multiswapLogs = await getLogs({ targets: routers, eventAbi: event_multiswap, })

  // add volume
  logs.forEach(i => dailyVolume.add(i.outputToken, i.amountOut))
  multiswapLogs.forEach(i => dailyVolume.add(i.tokensOut, i.amountsOut))

  // add fees
  logs.forEach(i => dailyFees.add(i.outputToken, Number(i.slippage) > 0 ? i.slippage : 0))
  multiswapLogs.forEach(i => dailyFees.add(i.tokensOut, i.amountsOut.map((a: any) => Number(a) * .01 / 100))) // 0.01% fixed fee

  const logs_v3 = await getLogs({ targets: [ODOS_ROUTER_V3], eventAbi: event_swap_v3, })
  const multiswapLogs_v3 = await getLogs({ targets: [ODOS_ROUTER_V3], eventAbi: event_multiswap_v3, })

  // add v3 volume
  logs_v3.forEach(i => dailyVolume.add(i.outputToken, i.amountOut))
  multiswapLogs_v3.forEach(i => dailyVolume.add(i.tokensOut, i.amountsOut))

  // add V3 Odos fees
  function addV3Fees(entry: any) {

    // FE fees will use referral code 1 and keep the funds in the router as revenue
    const isFrontendFee = Number(entry.referralCode) == 1 && entry.referralFeeRecipient == ODOS_ROUTER_V3

    // Single-output case
    if (entry.outputToken) {
      const slippageFee = Number(entry.slippage) > 0 ? Number(entry.slippage) : 0

      const frontendFee = isFrontendFee ? Number(entry.referralFee) * Number(entry.amountOut) / 1e18 : 0

      dailyFees.add(entry.outputToken, slippageFee + frontendFee)
    }

    // Multi-output case
    if (entry.tokensOut && entry.amountsOut) {
      entry.tokensOut.forEach((token: string, idx: number) => {
        const tokenSlippage = Number(entry.slippage[idx])

        const slippageFee = tokenSlippage > 0 ? tokenSlippage : 0

        const frontendFee = isFrontendFee ? Number(entry.referralFee) *  Number(entry.amountsOut[idx]) / 1e18 : 0

        dailyFees.add(token, slippageFee + frontendFee)
      })
    }
  }
  logs_v3.forEach(addV3Fees)
  multiswapLogs_v3.forEach(addV3Fees)
  
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: 0,
  };
}

const start = '2023-07-14'
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "All fees paid by users for using Odos services.",
    UserFees: "All fees paid by users for using Odos services.",
    Revenue: "Revenue is equal to the fees collected.",
    HoldersRevenue: "No revenue distributed to ODOS holders.",
    SupplySideRevenue: "No revenue distributed to supply side.",
    ProtocolRevenue: "Revenue is equal to the fees collected.",
  },
  fetch,
  start,
  chains: Object.keys(ODOS_V2_ROUTERS),
};

export default adapter;

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
