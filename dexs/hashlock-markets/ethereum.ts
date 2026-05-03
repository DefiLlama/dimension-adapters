import { FetchOptions, FetchResultV2 } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";

// Hashlock Markets Ethereum mainnet HTLC contracts.
// Source: https://github.com/Hashlock-Tech/hashlock-markets/blob/main/contracts/deployments-mainnet.json
const CONTRACTS = {
  HashedTimelockEther: "0x0CEDC56b17d714dA044954EE26F38e90eC10434A",
  HashedTimelockEtherFee: "0xfBAEA1423b5FBeCE89998da6820902fD8f159014",
  HashedTimelockERC20Fee: "0x4B65490D140Bab3DB828C2386e21646Ed8c4D072",
} as const;

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

  // Native-ETH HTLCs (no-fee + fee variants share the same Withdraw event signature).
  const ethLogs = await options.getLogs({
    targets: [CONTRACTS.HashedTimelockEther, CONTRACTS.HashedTimelockEtherFee],
    eventAbi: ABIS.HTLCETH_Withdraw,
    flatten: true,
  });
  for (const log of ethLogs) {
    dailyVolume.add(ETHEREUM_NATIVE, log.amount);
  }

  // ERC-20 HTLCs (fee variant only — base ERC20 contract was not deployed on mainnet).
  const erc20Logs = await options.getLogs({
    target: CONTRACTS.HashedTimelockERC20Fee,
    eventAbi: ABIS.HTLCERC20_Withdraw,
  });
  for (const log of erc20Logs) {
    dailyVolume.add(log.tokenContract, log.amount);
  }

  return { dailyVolume };
}
