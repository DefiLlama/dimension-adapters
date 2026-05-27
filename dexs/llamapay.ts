import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// LlamaPay streams ERC-20s by the second. A factory per chain deploys one
// streaming contract per token; recipients withdraw accrued funds whenever they
// like. We treat the value WITHDRAWN by recipients as the protocol's payment
// volume (the money actually settled to people), read on-chain from Withdraw
// events. LlamaPay charges no protocol fee, so there is no fees/revenue to report.
//
// Withdraw(from, to, amountPerSec, streamId, amount): in LlamaPay.sol `amount` is
// `amountToTransfer = (delta * amountPerSec) / DECIMALS_DIVISOR` (the exact token
// amount transferred to the recipient in NATIVE token decimals), so it can be
// summed directly via Balances.add(token, amount).

// Original CREATE2 salary-streaming factory (same address across the early chains).
const OLD_FACTORY = "0xde1C04855c2828431ba637675B6929A684f84C7F";
// Second deterministic factory used on the newer chains (Base, Scroll, Sonic, ...).
const NEW_FACTORY = "0x09c39B8311e4B7c678cBDAD76556877ecD3aEa07";

const CONFIG: Record<string, { factory: string; start: string }> = {
  [CHAIN.ETHEREUM]: { factory: OLD_FACTORY, start: "2022-06-01" },
  [CHAIN.ARBITRUM]: { factory: OLD_FACTORY, start: "2022-06-01" },
  [CHAIN.OPTIMISM]: { factory: OLD_FACTORY, start: "2022-06-01" },
  [CHAIN.POLYGON]: { factory: OLD_FACTORY, start: "2022-06-01" },
  [CHAIN.XDAI]: { factory: OLD_FACTORY, start: "2022-06-01" },
  [CHAIN.AVAX]: { factory: "0x7d507b4c2d7e54da5731f643506996da8525f4a3", start: "2022-06-01" },
  [CHAIN.BASE]: { factory: NEW_FACTORY, start: "2023-08-01" },
  [CHAIN.SCROLL]: { factory: NEW_FACTORY, start: "2023-10-01" },
  [CHAIN.SONIC]: { factory: NEW_FACTORY, start: "2024-12-01" },
  [CHAIN.BERACHAIN]: { factory: NEW_FACTORY, start: "2025-02-01" },
  [CHAIN.METIS]: { factory: "0x43634d1C608f16Fb0f4926c12b54124C93030600", start: "2022-06-01" },
};

const abi = {
  count: "uint256:getLlamaPayContractCount",
  byIndex: "function getLlamaPayContractByIndex(uint256) view returns (address)",
  token: "address:token",
  withdraw:
    "event Withdraw(address indexed from, address indexed to, uint216 amountPerSec, bytes32 streamId, uint amount)",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const contracts: string[] = await options.api.fetchList({
    lengthAbi: abi.count,
    itemAbi: abi.byIndex,
    target: CONFIG[options.chain].factory,
  });
  if (!contracts.length) return { dailyVolume };

  // Each contract streams exactly one token; map contract -> token.
  const tokens: string[] = await options.api.multiCall({ abi: abi.token, calls: contracts });
  const tokenByContract: Record<string, string> = {};
  contracts.forEach((c, i) => {
    tokenByContract[c.toLowerCase()] = tokens[i];
  });

  // Withdraw events = value paid out to recipients in the window (native units).
  // onlyArgs:false keeps the emitting contract address (each contract = one token)
  // alongside the decoded args, so we can attribute each withdrawal to its token.
  const logs = await options.getLogs({ targets: contracts, eventAbi: abi.withdraw, onlyArgs: false });
  for (const log of logs) {
    const token = tokenByContract[(log.address || log.source || "").toLowerCase()];
    if (token) dailyVolume.add(token, log.args.amount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Total value withdrawn by stream recipients across all per-token LlamaPay contracts, summed on-chain from Withdraw events (contracts enumerated via the LlamaPay factory). Amounts are in native token decimals. LlamaPay charges no protocol fee, so no fees/revenue is reported.",
  },
  adapter: CONFIG,
  fetch,
};

export default adapter;
