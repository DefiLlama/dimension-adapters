import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Clementine, Citrea's canonical BTC bridge, read from the Bridge precompile on Citrea (one-sided, destination chain
// Bitcoin, attributed server-side): Deposit = a peg-in, BTC arriving as cBTC (incoming); Withdrawal = a peg-out back
// to Bitcoin (outgoing; batchWithdraw emits one per UTXO). Every peg is a fixed amount, read from depositAmount()
// (10 cBTC, 18 decimals, at the time of writing). Weeks without events are normal at that size.
const BRIDGE = "0x3100000000000000000000000000000000000002";
const DEPOSIT = "event Deposit(bytes32 wtxId, bytes32 txId, address recipient, uint256 timestamp, uint256 depositId)";
const WITHDRAWAL = "event Withdrawal((bytes32 txId, bytes4 outputId) utxo, uint256 index, uint256 timestamp)";

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  const deposits = await options.getLogs({ target: BRIDGE, eventAbi: DEPOSIT });
  const withdrawals = await options.getLogs({ target: BRIDGE, eventAbi: WITHDRAWAL });
  if (deposits.length || withdrawals.length) {
    const pegAmount = BigInt(await options.toApi.call({ target: BRIDGE, abi: "uint256:depositAmount" }));
    dailyIncomingVolume.addGasToken(pegAmount * BigInt(deposits.length));
    dailyOutgoingVolume.addGasToken(pegAmount * BigInt(withdrawals.length));
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: withdrawals.length, dailyIncomingTxCount: deposits.length };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CITREA],
  methodology: {
    OutgoingVolume: "Value of cBTC sent back to Bitcoin through Clementine peg-outs (a fixed amount each).",
    IncomingVolume: "Value of BTC arriving on Citrea as cBTC through Clementine peg-ins (a fixed amount each).",
    OutgoingTxCount: "Number of Clementine peg-outs (one per UTXO).",
    IncomingTxCount: "Number of Clementine peg-ins.",
  },
};

export default adapter;
