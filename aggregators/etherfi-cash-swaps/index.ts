import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Swaps ether.fi Cash users make from their Cash safes, through ether.fi's own swap modules.
// Contracts: https://github.com/etherfi-protocol/cash-v3/tree/master (deployments/mainnet/<chainId>/deployments.json)

// EtherFiDataProvider (same address on OP Mainnet and Scroll). A safe can only call modules it whitelists, and ether.fi
// replaces its swap modules every few months, so they are discovered from getWhitelistedModules instead of a fixed list.
const DATA_PROVIDER = '0xDC515Cb479a64552c5A11a57109C314E40A1A778';

// src/modules/openocean-swap/OpenOceanSwapModule.sol, swaps routed through OpenOcean's exchange 0x6352a56caadc4f1e25cd6c75970fa768a3304e64
const SWAP_ON_OPENOCEAN = "event SwapOnOpenOcean(address indexed safe, address indexed fromAsset, address indexed toAsset, uint256 fromAssetAmount, uint256 minToAssetAmount, uint256 returnAmt)";

// src/enso/EnsoSwapModule.sol: the safe's owners sign a request, a keeper then executes it through Enso's router.
// src/across/AcrossSwapModule.sol emits the same SwapRequested/SwapExecuted signatures, so Enso modules are told apart by getEnsoRouter.
const ENSO_SWAP_REQUESTED = "event SwapRequested(address indexed safe, bytes32 indexed swapId, address srcToken, uint256 srcAmount, uint256 dstChainId, address dstToken, address recipient, uint256 minOut, uint256 deadline)";
const ENSO_SWAP_EXECUTED = "event SwapExecuted(address indexed safe, bytes32 indexed swapId, uint256 dstChainId, address indexed dstToken, uint256 minOut)";

const ENSO_REQUEST_LOOKBACK = 3600;

type Config = {
  start: string;
  deadFrom?: string;
  chainId: number;
};

const chainConfig: Record<string, Config> = {
  [CHAIN.OPTIMISM]: {
    // first SwapOnOpenOcean: 0x5765177E... on 2026-04-01
    start: '2026-04-01',
    chainId: 10,
  },
  [CHAIN.SCROLL]: {
    // first SwapOnOpenOcean: https://scrollscan.com/tx/0xbb1247a0345703b9cb717df4ff2b2b9bbac432c6759f3013e6b610e96c03b230 (2025-04-04)
    start: '2025-04-04',
    // last SwapOnOpenOcean: https://scrollscan.com/tx/0x0709c8dc229a4c779258a8c899c122c39e337b5121e167bcbea4e508aa6c3a02 (2026-04-09), no Scroll swap module has emitted since
    deadFrom: '2026-04-10',
    chainId: 534352,
  },
};

const fetch = async (options: FetchOptions) => {
  const { chainId } = chainConfig[options.chain];
  const dailyVolume = options.createBalances();

  // whitelist at both window edges, so a module added or removed during the window is still read
  const [startModules, endModules] = await Promise.all([
    options.fromApi.call({ target: DATA_PROVIDER, abi: 'address[]:getWhitelistedModules' }),
    options.api.call({ target: DATA_PROVIDER, abi: 'address[]:getWhitelistedModules' }),
  ]);
  const modules = [...new Set([...startModules, ...endModules].map((module: string) => module.toLowerCase()))];

  const openOceanSwaps = await options.getLogs({ targets: modules, eventAbi: SWAP_ON_OPENOCEAN });
  openOceanSwaps.forEach((swap: any) => dailyVolume.add(swap.fromAsset, swap.fromAssetAmount));

  const executions = await options.getLogs({ targets: modules, eventAbi: ENSO_SWAP_EXECUTED, onlyArgs: false });
  // only swaps that settle on this chain; the others send the funds to the user's trading safe on another chain
  const sameChain = executions.filter((execution: any) => Number(execution.args.dstChainId) === chainId);
  if (!sameChain.length) return { dailyVolume };

  const emitters = [...new Set(sameChain.map((execution: any) => execution.address.toLowerCase()))] as string[];
  // reverts on any module that is not an Enso swap module (Across)
  const ensoRouters = await options.api.multiCall({ abi: 'address:getEnsoRouter', calls: emitters, permitFailure: true });
  const ensoModules = emitters.filter((_, i) => ensoRouters[i]);
  if (!ensoModules.length) return { dailyVolume };
  const ensoExecutions = sameChain.filter((execution: any) => ensoModules.includes(execution.address.toLowerCase()));

  const requests = await options.getLogs({
    targets: ensoModules,
    eventAbi: ENSO_SWAP_REQUESTED,
    fromBlock: await options.getBlock(options.fromTimestamp - ENSO_REQUEST_LOOKBACK, options.chain, {}),
    onlyArgs: false,
  });
  const swapKey = (module: string, safe: string, swapId: string) => `${module.toLowerCase()}-${safe.toLowerCase()}-${swapId}`;
  const requestByKey: Record<string, any> = {};
  requests.forEach((request: any) => { requestByKey[swapKey(request.address, request.args.safe, request.args.swapId)] = request.args; });

  ensoExecutions.forEach((execution: any) => {
    const { safe, swapId } = execution.args;
    const request = requestByKey[swapKey(execution.address, safe, swapId)];
    if (!request) throw new Error(`No SwapRequested within ${ENSO_REQUEST_LOOKBACK}s before the window for Enso swap ${swapId} of safe ${safe}`);
    dailyVolume.add(request.srcToken, request.srcAmount);
  });

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
