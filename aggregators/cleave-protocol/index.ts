import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";

// Event ABIs from the verified CleaveSwapShell / CleaveMeasuredShell(V2) sources,
// e.g. https://etherscan.io/address/0x016750b998AaB0b4b07AA6a2276335053A798758#code
// and https://etherscan.io/address/0x5AfF91027390f731058AcC15E0A3F927b250c9FE#code
// Native ETH input is wrapped by the shells, so tokenIn is always an ERC20 (WETH for native swaps).
const SwapExecutedEvent =
  "event SwapExecuted(address indexed tokenIn, address indexed tokenOut, address indexed sender, uint256 amountIn, uint256 amountOut, uint256 protocolFee, address referrer, uint256 referralFee)";
const MeasuredSwapEvent =
  "event MeasuredSwapV1(address indexed payer, address indexed recipient, address indexed tokenIn, address tokenOut, (uint256 payerNetDebit, uint256 inputRefund, uint256 inputResidue, uint256 grossOut, uint256 recipientCredit, uint256 protocolFee, uint256 referralFee, uint256 flags) result)";

// Contract addresses: https://cleave.fi/developers and https://api.cleave.fi/v1/meta
// The same address can be a different contract on another chain.
// swapShell: classic shell. measuredShells: CleaveMeasuredShell (legacy) and CleaveMeasuredShellV2 (current).
// Cross-chain trades also swap through these shells; those legs are left to bridge volume and skipped here:
// - swapShellCallers: CleaveCrossChainRouter (source leg) and CleaveComposer (destination leg), the `sender` of SwapExecuted.
// - crossChainRouterV2: source leg on CleaveMeasuredShellV2, which it calls with itself as `recipient`.
// - composerV2: destination leg on CleaveMeasuredShellV2, which it calls as `payer`.
// - ACROSS_MULTICALL_HANDLER: destination leg of Across routes, run by Across's MulticallHandler in the relayer's fill
//   (e.g. Polygon tx 0xc9dce7dd59ca73e237fb0518b949f24f7e51a5ca619d50184c76e2a2b5daecb7). Same address on every chain.
// CleaveCrossChainRouterV3 and CleaveComposerV3/V4 swap only through their own measured shell, which is not tracked.
const ACROSS_MULTICALL_HANDLER = "0x0F7Ae28dE1C8532170AD4ee566B5801485c13a0E";
const chainConfig: Record<string, { swapShell: string; measuredShells: string[]; swapShellCallers: string[]; crossChainRouterV2: string; composerV2: string; start: string }> = {
  [CHAIN.ETHEREUM]: {
    swapShell: "0x016750b998AaB0b4b07AA6a2276335053A798758",
    measuredShells: ["0xB7E460AD3a1E27B8fF29b6530e0d34174Ebb1032", "0x5AfF91027390f731058AcC15E0A3F927b250c9FE"],
    swapShellCallers: ["0x252554A4d2A4e99a68aB23D68CC560Fe7449c208", "0x7CfBD7D0eFfbe623D4Daa183903EE65923EcbEB6"],
    crossChainRouterV2: "0x25c81B44BA6219E2BfEeEF4d20790797c4Eec6B8",
    composerV2: "0x3BbC74a7066dDa17eF570bB899E0CD9b04eAb922",
    start: "2026-10-11",
  },
  [CHAIN.ARBITRUM]: {
    swapShell: "0x4052700f83324Be5710d187b7bbEa9837DfFa8fc",
    measuredShells: ["0xa66ca1556a7a43008b5518EFD0c63EAbb1d0f5BA", "0x78D851D8BC6A9b9739549E7515Bf02D6394E1794"],
    swapShellCallers: ["0x252554A4d2A4e99a68aB23D68CC560Fe7449c208", "0x7CfBD7D0eFfbe623D4Daa183903EE65923EcbEB6"],
    crossChainRouterV2: "0x8A0d00556d3FdF59466515d85faC74281d6Ac47d",
    composerV2: "0x36D72E6bD90d0A8938231e7fA9b0c666B91d1e84",
    start: "2026-10-11",
  },
  [CHAIN.BASE]: {
    swapShell: "0xb08F28a3575805ee1E3729fc19Ab7E869CBAF563",
    measuredShells: ["0x016750b998AaB0b4b07AA6a2276335053A798758", "0x003d4C95756608Ed4C11C5d0Ad9ca4c4076cAF20"],
    swapShellCallers: ["0x6E794Eb6de9e5F61D99C90B4BaCacd713c382dCc", "0xb8B2d989db6Cd5C21E3caD6B16Fa940CFeAf6601"],
    crossChainRouterV2: "0x9CAc7E3e563218Ba5F2D0c9367e3a65442c12c7D",
    composerV2: "0x78D851D8BC6A9b9739549E7515Bf02D6394E1794",
    start: "2026-10-11",
  },
  [CHAIN.BSC]: {
    swapShell: "0x48dD089939C9a29211e7De9417e91A141D37F697",
    measuredShells: ["0x9f1608C049ACa5fEF458739c0Bdc09b921B1cda2", "0xC269a4F4dEbD4036597ee830349d824D5bA9ca7E"],
    swapShellCallers: ["0xB2e1Ea827a38E5DbD7eefAC4eAb86eF8C5D037eE", "0x6e514BAcCC5afd905b78e4920223EE1e7B3EaB42"],
    crossChainRouterV2: "0x41562c26dA7F39b9d3B0140450409EADED4a53aD",
    composerV2: "0xeFB90fD898db94b930e1BD0d89E1166f29561C28",
    start: "2026-10-11",
  },
  [CHAIN.POLYGON]: {
    swapShell: "0x5b4a223D8489a3b97d4EBe8fE93C6A7aC3Ec1AD6",
    measuredShells: ["0x2375D04cb98714f7a921B433836b0E1AFc252f3F", "0xA06eE4d57A2E6ea9213Ab4Bce2C055fD09BB43A1"],
    swapShellCallers: ["0x8a47726eb4961d8e3198f19402dA05F7E6DB7733", "0xE68E3AC542AB90e9107D2b907Ccc42F2F5EEEBdE"],
    crossChainRouterV2: "0x9Bb3184e5292A62fD2D00879bE23a55a63a293Dc",
    composerV2: "0x2961439F492F5B4CB0E0FF8CeD26D684B9E7A369",
    start: "2026-10-11",
  },
  [CHAIN.OPTIMISM]: {
    swapShell: "0xb08F28a3575805ee1E3729fc19Ab7E869CBAF563",
    measuredShells: ["0x016750b998AaB0b4b07AA6a2276335053A798758", "0x003d4C95756608Ed4C11C5d0Ad9ca4c4076cAF20"],
    swapShellCallers: ["0x6E794Eb6de9e5F61D99C90B4BaCacd713c382dCc", "0xb8B2d989db6Cd5C21E3caD6B16Fa940CFeAf6601"],
    crossChainRouterV2: "0xD2AE0f8fd16De89fb89F5d2e22fa6eB9e36Bb519",
    composerV2: "0x78D851D8BC6A9b9739549E7515Bf02D6394E1794",
    start: "2026-10-11",
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  // Count one side of each swap: the input, unless only the output is a core (reliably priced) asset.
  // tokenOut is always an ERC20 (WETH when the user receives native ETH); fees are taken from the output.
  const addSwap = (tokenIn: string, amountIn: any, tokenOut: string, grossOut: bigint) => {
    if (!isCoreAsset(options.chain, tokenIn) && isCoreAsset(options.chain, tokenOut)) dailyVolume.add(tokenOut, grossOut);
    else dailyVolume.add(tokenIn, amountIn);
  };
  const { swapShell, measuredShells, swapShellCallers, crossChainRouterV2, composerV2 } = chainConfig[options.chain];
  const crossChainCallers = new Set([...swapShellCallers, ACROSS_MULTICALL_HANDLER].map((a) => a.toLowerCase()));
  const crossChainPayers = new Set([composerV2, ACROSS_MULTICALL_HANDLER].map((a) => a.toLowerCase()));

  const swaps = await options.getLogs({ target: swapShell, eventAbi: SwapExecutedEvent });
  for (const log of swaps) {
    if (crossChainCallers.has(log.sender.toLowerCase())) continue;
    addSwap(log.tokenIn, log.amountIn, log.tokenOut, BigInt(log.amountOut) + BigInt(log.protocolFee) + BigInt(log.referralFee));
  }

  const measuredSwaps = await options.getLogs({ targets: measuredShells, eventAbi: MeasuredSwapEvent });
  for (const log of measuredSwaps) {
    if (log.recipient.toLowerCase() === crossChainRouterV2.toLowerCase()) continue;
    if (crossChainPayers.has(log.payer.toLowerCase())) continue;
    addSwap(log.tokenIn, log.result.payerNetDebit, log.tokenOut, BigInt(log.result.grossOut));
  }

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Value of same-chain swaps executed through Cleave's swap contracts, counted once per swap on the token sold (or on the token bought when only that one is a major token). Excludes cross-chain swaps and bridges.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
};

export default adapter;
