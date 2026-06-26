import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { buildHashlockLegIndex, isSourceLeg, ETH_HTLC_CONTRACTS } from "./shared";

// Withdraw events: only emitted on successful preimage redemption (settled leg).
// Refunded HTLCs emit HTLCETH_Refund / HTLCERC20_Refund instead, which are NOT counted.
const ABIS = {
  HTLCETH_Withdraw:
    "event HTLCETH_Withdraw(bytes32 indexed contractId, address indexed receiver, bytes32 preimage, uint256 amount)",
  HTLCERC20_Withdraw:
    "event HTLCERC20_Withdraw(bytes32 indexed contractId, address indexed receiver, bytes32 preimage, uint256 amount, address tokenContract)",
};

const ETHEREUM_NATIVE = ADDRESSES.ethereum.WETH; // price-feed proxy for native ETH

export async function fetchEthereum(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();
  const legIndex = await buildHashlockLegIndex(options);

  // Native-ETH HTLCs (no-fee + fee variants share the same Withdraw event signature).
  const ethLogs = await options.getLogs({
    targets: [ETH_HTLC_CONTRACTS.HashedTimelockEther, ETH_HTLC_CONTRACTS.HashedTimelockEtherFee],
    eventAbi: ABIS.HTLCETH_Withdraw,
    flatten: true,
  });
  for (const log of ethLogs) {
    const contractId = String(log.contractId).toLowerCase();
    const leg = legIndex.byEthContractId.get(contractId);
    // No matching Create in the 48h lookback window: paired-leg attribution
    // can't be determined here. Skip rather than risk double-counting.
    if (!leg) continue;
    if (!isSourceLeg(legIndex, leg)) continue;
    dailyVolume.add(ETHEREUM_NATIVE, log.amount);
  }

  // ERC-20 HTLCs (fee variant only — base ERC20 contract was not deployed on mainnet).
  const erc20Logs = await options.getLogs({
    target: ETH_HTLC_CONTRACTS.HashedTimelockERC20Fee,
    eventAbi: ABIS.HTLCERC20_Withdraw,
  });
  for (const log of erc20Logs) {
    const contractId = String(log.contractId).toLowerCase();
    const leg = legIndex.byEthContractId.get(contractId);
    if (!leg) continue;
    if (!isSourceLeg(legIndex, leg)) continue;
    dailyVolume.add(log.tokenContract, log.amount);
  }

  return { dailyVolume };
}
