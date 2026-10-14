import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// zkSync Era canonical bridge, Ethereum side. Since the ZK Stack v26 upgrade every asset (ETH and ERC20) is escrowed in the
// L1NativeTokenVault, which is shared by all ZK Stack chains: BridgeBurn when a deposit locks funds on L1, BridgeMint when a
// finalized withdrawal releases them. Only Era (chain id 324) is counted.
// One-sided: the Era leg is attributed server-side (destinationChain: era).
// https://docs.zksync.io/zk-stack/zk-chain-addresses
const NATIVE_TOKEN_VAULT = "0xbeD1EB542f9a5aA6419Ff3deb921A372681111f6";
const ERA_CHAIN_ID = 324;
const ETH_SENTINEL = "0x0000000000000000000000000000000000000001";
const NATIVE = "0x0000000000000000000000000000000000000000";

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  const isEra = (log: any) => Number(log.chainId) === ERA_CHAIN_ID;
  const burns = (await options.getLogs({
    target: NATIVE_TOKEN_VAULT,
    eventAbi: "event BridgeBurn(uint256 indexed chainId, bytes32 indexed assetId, address indexed sender, address receiver, uint256 amount)",
  })).filter(isEra);
  const mints = (await options.getLogs({
    target: NATIVE_TOKEN_VAULT,
    eventAbi: "event BridgeMint(uint256 indexed chainId, bytes32 indexed assetId, address receiver, uint256 amount)",
  })).filter(isEra);

  const assetIds = [...new Set([...burns, ...mints].map((log: any) => String(log.assetId)))];
  const tokens: string[] = await options.api.multiCall({ target: NATIVE_TOKEN_VAULT, abi: "function tokenAddress(bytes32) view returns (address)", calls: assetIds });
  const tokenOf: Record<string, string> = {};
  assetIds.forEach((assetId, i) => {
    const token = String(tokens[i]).toLowerCase();
    // an unregistered assetId would read as the zero address and be priced as ETH
    if (token === NATIVE) throw new Error(`zksync: no token registered for assetId ${assetId}`);
    tokenOf[assetId] = token === ETH_SENTINEL ? NATIVE : token;
  });

  for (const log of burns) dailyOutgoingVolume.add(tokenOf[String(log.assetId)], log.amount);
  for (const log of mints) dailyIncomingVolume.add(tokenOf[String(log.assetId)], log.amount);

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: burns.length, dailyIncomingTxCount: mints.length };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology: {
    OutgoingVolume: "USD value of ETH and tokens deposited from Ethereum into zkSync Era through the canonical bridge.",
    IncomingVolume: "USD value of ETH and tokens withdrawn from zkSync Era and released on Ethereum through the canonical bridge.",
    OutgoingTxCount: "Number of deposits from Ethereum into zkSync Era through the canonical bridge.",
    IncomingTxCount: "Number of withdrawals from zkSync Era released on Ethereum through the canonical bridge.",
  },
};

export default adapter;
