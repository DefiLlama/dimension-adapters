import { SimpleAdapter, FetchOptions, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CHAIN_KEY   = CHAIN.PLASMA;
const LAUNCHPAD   = "0x5a96508c1092960dA0981CaC7FD00217E9CdabEC";
const START_BLOCK = 1_872_202;
const WXPL        = "0x6100E367285b01F48D07953803A2d8dCA5D19873";
const WXPL_LC     = WXPL.toLowerCase();

const DEPLOYED_ABI = "event Deployed(address indexed token, uint256 amount)";
const PAIR_ABI     = "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)";
const SWAP_ABI     = "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)";

type Meta = { wxplIs0: boolean; createdBlock: number };
const tokenCache = new Map<string, Meta>();
let cachedToBlock = START_BLOCK - 1;

// Discover launchpad tokens and keep only WXPL pairs
async function ensureTokens(options: FetchOptions, toBlock: number) {
  if (cachedToBlock >= toBlock) return;
  const fromBlock = Math.max(START_BLOCK, cachedToBlock + 1);
  if (fromBlock > toBlock) return;

  const deployed = await options.getLogs({
    target: LAUNCHPAD,
    eventAbi: DEPLOYED_ABI,
    fromBlock,
    toBlock,
    cacheInCloud: true,
  });

  const txToToken = new Map<string, string>();
  for (const log of deployed) {
    const args = (log as any).args;
    const token = String(args?.token ?? "").toLowerCase();
    const txh = String((log as any).transactionHash ?? "").toLowerCase();
    if (token && txh) txToToken.set(txh, token);
  }
  if (!txToToken.size) { 
    cachedToBlock = Math.max(cachedToBlock, toBlock); 
    return; 
  }

  const pairs = await options.getLogs({
    target: LAUNCHPAD,
    eventAbi: PAIR_ABI,
    fromBlock,
    toBlock,
    cacheInCloud: true,
  });

  for (const log of pairs) {
    const txh = String((log as any).transactionHash ?? "").toLowerCase();
    const tokenAddr = txToToken.get(txh);
    if (!tokenAddr) continue;

    const args = (log as any).args;
    const token0 = String(args?.token0 ?? "").toLowerCase();
    const token1 = String(args?.token1 ?? "").toLowerCase();
    if (token0 !== WXPL_LC && token1 !== WXPL_LC) continue;

    const wxplIs0 = token0 === WXPL_LC;
    const createdBlock = Number((log as any).blockNumber ?? (log as any).block ?? toBlock);
    tokenCache.set(tokenAddr, { wxplIs0, createdBlock });
  }

  cachedToBlock = Math.max(cachedToBlock, toBlock);
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { createBalances } = options;
  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(), 
    options.getToBlock()
  ]);

  await ensureTokens(options, toBlock);

  const dailyVolume = createBalances();
  const dailyFees   = createBalances();
  const empty       = createBalances();

  const targets = Array.from(tokenCache.entries())
    .filter(([, m]) => m.createdBlock <= toBlock)
    .map(([t]) => t);

  if (targets.length) {
    // Single multi-target query
    const swaps = await options.getLogs({
      target: targets,
      eventAbi: SWAP_ABI,
      fromBlock,
      toBlock,
      cacheInCloud: true,
    });

    for (const log of swaps) {
      const addr = String((log as any).address ?? "").toLowerCase();
      const meta = tokenCache.get(addr);
      if (!meta) continue;

      const a = (log as any).args;
      const a0in  = (a?.amount0In  as bigint) ?? 0n;
      const a1in  = (a?.amount1In  as bigint) ?? 0n;
      const a0out = (a?.amount0Out as bigint) ?? 0n;
      const a1out = (a?.amount1Out as bigint) ?? 0n;

      const wxplIn  = meta.wxplIs0 ? a0in  : a1in;
      const wxplOut = meta.wxplIs0 ? a0out : a1out;
      const wxplVol = wxplIn > wxplOut ? wxplIn : wxplOut;
      
      if (wxplVol === 0n) continue;

      dailyVolume.addGasToken(wxplVol);
      dailyFees.addGasToken(wxplVol / 100n); // 1% fee
    }
  }

  // Single return point (no duplication)
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: empty,              
    dailyProtocolRevenue: empty,
    dailyHoldersRevenue: empty,
    dailySupplySideRevenue: empty,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN_KEY]: { 
      fetch, 
      start: START_BLOCK 
    },
  },
  methodology: {
    Fees: "1% of WXPL-side swap volume on tokens launched via the DYORSwap launchpad (bonding-curve tokens emit Swap events themselves).",
  },
};

export default adapter;
