import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const LAUNCHPAD = "0x5a96508c1092960dA0981CaC7FD00217E9CdabEC";
const START_BLOCK = 1872202;
const WXPL = "0x6100E367285b01F48D07953803A2d8dCA5D19873";
const WXPL_LC = WXPL.toLowerCase();

const PAIR_ABI = "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)";
const SWAP_ABI = "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const empty = options.createBalances();

  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock()
  ]);

  const pairs = await options.getLogs({
    target: LAUNCHPAD,
    eventAbi: PAIR_ABI,
    fromBlock: START_BLOCK,
    toBlock,
    cacheInCloud: true,
  });

  const pairMeta = new Map<string, { wxplIs0: boolean }>();

  for (const log of pairs) {
    const token0 = String(log[0] ?? "").toLowerCase();
    const token1 = String(log[1] ?? "").toLowerCase();
    const pair = String(log[2] ?? "").toLowerCase();

    if (!pair || (token0 !== WXPL_LC && token1 !== WXPL_LC)) continue;

    const wxplIs0 = token0 === WXPL_LC;
    pairMeta.set(pair, { wxplIs0 });
  }
  const targets = Array.from(pairMeta.keys());

  const swaps = await options.getLogs({
    targets: targets,
    eventAbi: SWAP_ABI,
    fromBlock,
    toBlock,
    cacheInCloud: true,
    entireLog: true,
  });

  for (const log of swaps) {
    const meta = pairMeta.get(log.address);
    if (!meta) continue;

    const a0in = log.args.amount0In;
    const a1in = log.args.amount1In;
    const a0out = log.args.amount0Out;
    const a1out = log.args.amount1Out;
    const wxplIn = meta.wxplIs0 ? a0in : a1in;
    const wxplOut = meta.wxplIs0 ? a0out : a1out;
    const wxplVol = wxplIn > wxplOut ? wxplIn : wxplOut;

    if (wxplVol === 0n) continue;

    dailyVolume.addGasToken(wxplVol);
    dailyFees.addGasToken(wxplVol / 100n); // 1% fee
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: empty,
    dailySupplySideRevenue: empty,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.PLASMA],
  start: '2025-09-24',
  methodology: {
    Fees: "1% of WXPL-side swap volume on tokens launched via the DYORSwap launchpad (bonding-curve tokens emit Swap events themselves).",
    Revenue: "bonding curve fees goes to protocol treasury.",
    ProtocolRevenue: "bonding curve fees goes to protocol treasury.",
  },
};

export default adapter;
