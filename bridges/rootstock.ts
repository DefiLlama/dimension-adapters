import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Rootstock PowPeg, read from the Bridge precompile on Rootstock (one-sided, destination chain Bitcoin, attributed
// server-side): pegin_btc = BTC arriving as RBTC (incoming), release_request_received = accepted peg-out requests back
// to Bitcoin (outgoing; a rejected request emits release_request_rejected instead and is refunded).
// Peg-in amounts are in satoshis (RBTC has 18 decimals). Peg-out amounts are in satoshis until the Lovell upgrade and
// in weis from it (RSKIP-427, mainnet block 7,338,024: https://ips.rootstock.io/IPs/RSKIP435.html).
// The peg-out request's BTC address is `bytes` before the Fingerroot upgrade and `string` after; both are read.
const BRIDGE = "0x0000000000000000000000000000000001000006";
const SATS_TO_RBTC = 10n ** 10n;
const LOVELL_BLOCK = 7_338_024;
const pegoutToWei = (log: any) => BigInt(log.args.amount) * (Number(log.blockNumber) >= LOVELL_BLOCK ? 1n : SATS_TO_RBTC);
const PEGIN = "event pegin_btc(address indexed receiver, bytes32 indexed btcTxHash, int256 amount, int256 protocolVersion)";
const PEGOUT = "event release_request_received(address indexed sender, string btcDestinationAddress, uint256 amount)";
const PEGOUT_PRE_FINGERROOT = "event release_request_received(address indexed sender, bytes btcDestinationAddress, uint256 amount)";

// PowPeg Fast Mode (Flyover): liquidity providers front the transfer in native RBTC.
// PegOutDeposit locks RBTC to leave for Bitcoin; CallForUser is the provider delivering a peg-in (failed calls deliver nothing).
// The two routes never count the same transfer: Flyover peg-ins settle to the contract through registerFlyoverBtcTransaction,
// which emits no pegin_btc, and peg-out refunds pay the provider on Rootstock instead of going through the Bridge.
// https://dev.rootstock.io/developers/integrate/flyover/
// Flyover moved to separate peg-in and peg-out contracts on 2026-05-30; the old contract is kept for history.
const FLYOVER_LBC = "0xAA9cAf1e3967600578727F975F283446A3Da6612";
const LBC_PEGOUT = "event PegOutDeposit(bytes32 indexed quoteHash, address indexed sender, uint256 amount, uint256 timestamp)";
const LBC_PEGIN = "event CallForUser(address indexed from, address indexed dest, uint256 gasLimit, uint256 value, bytes data, bool success, bytes32 quoteHash)";
const FLYOVER_PEGIN_CONTRACT = "0x9270733402dc7c5730ea24268fc11039fd75e189";
const FLYOVER_PEGOUT_CONTRACT = "0x9a0678742cfb567874eb4e99df2106bded78f5e4";
const PEGOUT_DEPOSIT = "event PegOutDeposit(bytes32 indexed quoteHash, address indexed sender, uint256 indexed timestamp, uint256 amount)";
const CALL_FOR_USER = "event CallForUser(address indexed from, address indexed dest, bytes32 indexed quoteHash, uint256 gasLimit, uint256 value, bytes data, bool success)";

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  const pegins = await options.getLogs({ target: BRIDGE, eventAbi: PEGIN });
  const pegouts = [
    ...await options.getLogs({ target: BRIDGE, eventAbi: PEGOUT, onlyArgs: false }),
    ...await options.getLogs({ target: BRIDGE, eventAbi: PEGOUT_PRE_FINGERROOT, onlyArgs: false }),
  ];

  const flyoverPegouts = [
    ...await options.getLogs({ target: FLYOVER_LBC, eventAbi: LBC_PEGOUT }),
    ...await options.getLogs({ target: FLYOVER_PEGOUT_CONTRACT, eventAbi: PEGOUT_DEPOSIT }),
  ].filter((l: any) => BigInt(l.amount) > 0n);
  const flyoverPegins = [
    ...await options.getLogs({ target: FLYOVER_LBC, eventAbi: LBC_PEGIN }),
    ...await options.getLogs({ target: FLYOVER_PEGIN_CONTRACT, eventAbi: CALL_FOR_USER }),
  ].filter((l: any) => l.success && BigInt(l.value) > 0n);

  for (const l of pegins) dailyIncomingVolume.addGasToken(BigInt(l.amount) * SATS_TO_RBTC);
  for (const l of pegouts) dailyOutgoingVolume.addGasToken(pegoutToWei(l));
  for (const l of flyoverPegins) dailyIncomingVolume.addGasToken(l.value);
  for (const l of flyoverPegouts) dailyOutgoingVolume.addGasToken(l.amount);

  return {
    dailyOutgoingVolume,
    dailyIncomingVolume,
    dailyOutgoingTxCount: pegouts.length + flyoverPegouts.length,
    dailyIncomingTxCount: pegins.length + flyoverPegins.length,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROOTSTOCK],
  methodology: {
    OutgoingVolume: "Value of RBTC sent back to Bitcoin through Rootstock's PowPeg: accepted peg-out requests and Fast Mode (Flyover) peg-out deposits.",
    IncomingVolume: "Value of BTC arriving on Rootstock as RBTC through the PowPeg: peg-ins and Fast Mode (Flyover) peg-ins delivered by liquidity providers.",
    OutgoingTxCount: "Number of accepted peg-out requests and Fast Mode peg-out deposits on Rootstock.",
    IncomingTxCount: "Number of peg-ins and Fast Mode peg-ins on Rootstock.",
  },
};

export default adapter;
