import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Swaps ether.fi Cash users make from their Cash safes, through ether.fi's own swap modules.
// Addresses are from ether.fi's deployment files: https://github.com/etherfi-protocol/cash-v3/tree/master/deployments/mainnet
// (10/deployments.json for OP Mainnet, 534352/deployments.json for Scroll, and their git history for the earlier modules).

// src/modules/openocean-swap/OpenOceanSwapModule.sol, swaps routed through OpenOcean's exchange 0x6352a56caadc4f1e25cd6c75970fa768a3304e64
const SWAP_ON_OPENOCEAN = "event SwapOnOpenOcean(address indexed safe, address indexed fromAsset, address indexed toAsset, uint256 fromAssetAmount, uint256 minToAssetAmount, uint256 returnAmt)";

// src/enso/EnsoSwapModule.sol: the safe's owners sign a request, a keeper then executes it through Enso's router
const ENSO_SWAP_REQUESTED = "event SwapRequested(address indexed safe, bytes32 indexed swapId, address srcToken, uint256 srcAmount, uint256 dstChainId, address dstToken, address recipient, uint256 minOut, uint256 deadline)";
const ENSO_SWAP_EXECUTED = "event SwapExecuted(address indexed safe, bytes32 indexed swapId, uint256 dstChainId, address indexed dstToken, uint256 minOut)";

// Executions so far follow their request within 25 minutes; requests are read from this far before the window.
const ENSO_REQUEST_LOOKBACK = 2 * 3600;

type Config = {
  start: string;
  deadFrom?: string;
  chainId: number;
  openOceanModules: string[];
  ensoSwapModule?: string;
};

const chainConfig: Record<string, Config> = {
  [CHAIN.OPTIMISM]: {
    // first SwapOnOpenOcean: 0x5765177E... on 2026-04-01
    start: '2026-04-01',
    chainId: 10,
    // every OpenOceanSwapModule ether.fi has listed on OP Mainnet, ordered by first swap
    openOceanModules: [
      '0x5765177E7A0226F6a9969770bd24CBd67950c375', // 2026-04-01 to 2026-08-04
      '0x850D01FfCD8d23fA29751Eb26F8A473FFa4FFD0A', // 2026-08-04 to 2026-10-17
      '0xFec8640113C5ff6c28A9aBAE5162f8602D8BD4bF', // from 2026-10-18
    ],
    ensoSwapModule: '0xac6BcA0bB66D4587171CFc77b19E5E68F74De55e', // first same-chain execution 2026-07-27
  },
  [CHAIN.SCROLL]: {
    // first SwapOnOpenOcean: https://scrollscan.com/tx/0xbb1247a0345703b9cb717df4ff2b2b9bbac432c6759f3013e6b610e96c03b230 (2025-04-04)
    start: '2025-04-04',
    // last SwapOnOpenOcean: https://scrollscan.com/tx/0x0709c8dc229a4c779258a8c899c122c39e337b5121e167bcbea4e508aa6c3a02 (2026-04-09), no Scroll swap module has emitted since
    deadFrom: '2026-04-10',
    chainId: 534352,
    // every OpenOceanSwapModule ether.fi has listed on Scroll that emitted swaps, ordered by first swap
    openOceanModules: [
      '0x38Ce1a31e69f3A6E4CfB6b2E47726e67d31A2Ef4', // 2025-04-04 to 2025-05-14
      '0x115340754572c32222D358449D7588eA809B1099', // 2025-05-14 to 2025-05-30
      '0x57d23DEa576c88AA5a3F919b1a38f44E1D4b0512', // 2025-05-30 to 2025-07-22
      '0x4dEAa5f2e1CD1A792304d1649EdfA35D565F9346', // 2025-07-22 to 2026-04-09
    ],
  },
};

const fetch = async (options: FetchOptions) => {
  const { chainId, openOceanModules, ensoSwapModule } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  const openOceanSwaps = await options.getLogs({ targets: openOceanModules, eventAbi: SWAP_ON_OPENOCEAN });
  openOceanSwaps.forEach((swap: any) => dailyVolume.add(swap.fromAsset, swap.fromAssetAmount));

  if (ensoSwapModule) {
    const executions = await options.getLogs({ target: ensoSwapModule, eventAbi: ENSO_SWAP_EXECUTED });
    // only swaps that settle on this chain; the others send the funds to the user's trading safe on another chain
    const sameChain = executions.filter((execution: any) => Number(execution.dstChainId) === chainId);
    if (sameChain.length) {
      const requests = await options.getLogs({
        target: ensoSwapModule,
        eventAbi: ENSO_SWAP_REQUESTED,
        fromBlock: await options.getBlock(options.fromTimestamp - ENSO_REQUEST_LOOKBACK, options.chain, {}),
      });
      const requestById: Record<string, any> = {};
      requests.forEach((request: any) => { requestById[`${request.safe.toLowerCase()}-${request.swapId}`] = request; });
      sameChain.forEach((execution: any) => {
        const request = requestById[`${execution.safe.toLowerCase()}-${execution.swapId}`];
        if (!request) throw new Error(`No SwapRequested found for Enso swap ${execution.swapId} of safe ${execution.safe}`);
        dailyVolume.add(request.srcToken, request.srcAmount);
      });
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  doublecounted: true, // every swap is routed through OpenOcean or Enso, whose aggregator listings already count it
  methodology: {
    Volume: "Value of the tokens ether.fi Cash users sell in swaps made from their Cash safes through ether.fi's OpenOcean and Enso swap modules, counted when the swap executes. Enso swaps that send the output to another chain are not counted.",
  },
};

export default adapter;
