import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Sui's native bridge, read on Ethereum only (one-sided, destination chain Sui, attributed server-side):
// TokensDeposited = tokens leaving Ethereum for Sui (outgoing), TokensClaimed = tokens arriving from Sui (incoming).
// SuiBridge https://etherscan.io/address/0xda3bD1fE1973470312db04551B65f401Bc8a92fD; token ids resolve on its
// BridgeConfig (tokenAddressOf / tokenSuiDecimalOf). Deposit amounts are in Sui decimals, claims in ERC20 decimals.
// Native ETH is bridged as token id 2 (WETH) and unwrapped through the vault, so the events still carry the amount.
const SUI_BRIDGE = "0xda3bD1fE1973470312db04551B65f401Bc8a92fD";
const BRIDGE_CONFIG = "0x72D34Fe82c71Bf8120647518e5128e53106a1540";
const DEPOSITED = "event TokensDeposited(uint8 indexed sourceChainID, uint64 indexed nonce, uint8 indexed destinationChainID, uint8 tokenID, uint64 suiAdjustedAmount, address senderAddress, bytes recipientAddress)";
const CLAIMED = "event TokensClaimed(uint8 indexed sourceChainID, uint64 indexed nonce, uint8 indexed destinationChainID, uint8 tokenID, uint256 erc20AdjustedAmount, bytes senderAddress, address recipientAddress)";

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  const deposits = await options.getLogs({ target: SUI_BRIDGE, eventAbi: DEPOSITED });
  const claims = await options.getLogs({ target: SUI_BRIDGE, eventAbi: CLAIMED });

  const tokenIds = [...new Set([...deposits, ...claims].map((l: any) => Number(l.tokenID)))];
  if (tokenIds.length) {
    const tokens: string[] = await options.api.multiCall({ target: BRIDGE_CONFIG, abi: "function tokenAddressOf(uint8) view returns (address)", calls: tokenIds });
    const suiDecimals: number[] = await options.api.multiCall({ target: BRIDGE_CONFIG, abi: "function tokenSuiDecimalOf(uint8) view returns (uint8)", calls: tokenIds });
    const erc20Decimals: number[] = await options.api.multiCall({ abi: "erc20:decimals", calls: tokens });
    const byId = Object.fromEntries(tokenIds.map((id, i) => [id, { token: tokens[i], scale: 10n ** BigInt(Number(erc20Decimals[i]) - Number(suiDecimals[i])) }]));

    for (const l of deposits) {
      const { token, scale } = byId[Number(l.tokenID)];
      dailyOutgoingVolume.add(token, BigInt(l.suiAdjustedAmount) * scale);
    }
    for (const l of claims) dailyIncomingVolume.add(byId[Number(l.tokenID)].token, l.erc20AdjustedAmount);
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: deposits.length, dailyIncomingTxCount: claims.length };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology: {
    OutgoingVolume: "Value of tokens deposited into the Sui Bridge on Ethereum to be sent to Sui.",
    IncomingVolume: "Value of tokens claimed on Ethereum from the Sui Bridge after being sent from Sui.",
    OutgoingTxCount: "Number of Sui Bridge deposits on Ethereum.",
    IncomingTxCount: "Number of Sui Bridge claims on Ethereum.",
  },
};

export default adapter;
