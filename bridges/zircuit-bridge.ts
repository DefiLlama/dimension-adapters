import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Zircuit's canonical bridge (OP stack), Ethereum side. One-sided: the Zircuit leg is attributed server-side.
const PORTAL = "0x17bfAfA932d2e23Bd9B909Fd5B4D2e2a27043fb1"; // L1CrossDomainMessenger.portal()
const BRIDGE = "0x386B76D9cA5F5Fb150B6BFB35CF5379B22B26dd8"; // L1StandardBridge

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  // ETH deposits: every deposit reaches Zircuit through the Portal, directly or via the bridge, and its opaqueData starts with the ETH minted
  const deposits = await options.getLogs({ target: PORTAL, eventAbi: "event TransactionDeposited(address indexed from, address indexed to, uint256 indexed version, bytes opaqueData)" });
  for (const { opaqueData } of deposits) {
    const mint = BigInt(ethers.dataSlice(opaqueData, 0, 32));
    if (!mint) continue;
    dailyOutgoingVolume.addGasToken(mint);
    dailyOutgoingTxCount++;
  }

  // ETH withdrawals through the bridge (ETH withdrawn directly through the Portal carries no amount on Ethereum)
  const ethWithdrawals = await options.getLogs({ target: BRIDGE, eventAbi: "event ETHBridgeFinalized(address indexed from, address indexed to, uint256 amount, bytes extraData)" });
  for (const { amount } of ethWithdrawals) {
    dailyIncomingVolume.addGasToken(amount);
    dailyIncomingTxCount++;
  }

  // Token deposits and withdrawals
  const tokenDeposits = await options.getLogs({ target: BRIDGE, eventAbi: "event ERC20BridgeInitiated(address indexed localToken, address indexed remoteToken, address indexed from, address to, uint256 amount, bytes extraData)" });
  for (const { localToken, amount } of tokenDeposits) {
    dailyOutgoingVolume.add(localToken, amount);
    dailyOutgoingTxCount++;
  }
  const tokenWithdrawals = await options.getLogs({ target: BRIDGE, eventAbi: "event ERC20BridgeFinalized(address indexed localToken, address indexed remoteToken, address indexed from, address to, uint256 amount, bytes extraData)" });
  for (const { localToken, amount } of tokenWithdrawals) {
    dailyIncomingVolume.add(localToken, amount);
    dailyIncomingTxCount++;
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2024-12-06", // first day the old bridges server recorded Zircuit volume
  methodology: {
    OutgoingVolume: "Value of ETH and tokens deposited from Ethereum into Zircuit through the canonical bridge and OptimismPortal.",
    IncomingVolume: "Value of ETH and tokens withdrawn from Zircuit through the canonical bridge and released on Ethereum. ETH withdrawn directly through the OptimismPortal is not included.",
    OutgoingTxCount: "Number of deposits from Ethereum into Zircuit.",
    IncomingTxCount: "Number of withdrawals from Zircuit released on Ethereum through the canonical bridge.",
  },
};

export default adapter;
