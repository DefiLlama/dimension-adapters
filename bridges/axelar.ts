import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Axelar token transfers on EVM chains, from two contracts:
// - the AxelarGateway (gateway tokens such as axlUSDC): ContractCallWithToken and TokenSent when tokens leave a chain,
//   ContractCallApprovedWithMint when they are approved for delivery on the destination chain. Tokens are named by
//   symbol and resolved with the gateway's tokenAddresses(symbol). Plain sendToken/deposit-address deliveries emit no
//   event of their own (only Executed); on Ethereum on 2026-09-29 they were 1 of 148 gateway commands, so they are not counted.
// - the Interchain Token Service (same address on every chain): InterchainTransfer out, InterchainTransferReceived in,
//   tokens resolved with registeredTokenAddress(tokenId).
const ITS = "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C";

const TOKEN_SENT = "event TokenSent(address indexed sender, string destinationChain, string destinationAddress, string symbol, uint256 amount)";
const CALL_WITH_TOKEN = "event ContractCallWithToken(address indexed sender, string destinationChain, string destinationContractAddress, bytes32 indexed payloadHash, bytes payload, string symbol, uint256 amount)";
const APPROVED_WITH_MINT = "event ContractCallApprovedWithMint(bytes32 indexed commandId, string sourceChain, string sourceAddress, address indexed contractAddress, bytes32 indexed payloadHash, string symbol, uint256 amount, bytes32 sourceTxHash, uint256 sourceEventIndex)";
const ITS_SENT = "event InterchainTransfer(bytes32 indexed tokenId, address indexed sourceAddress, string destinationChain, bytes destinationAddress, uint256 amount, bytes32 indexed dataHash)";
const ITS_RECEIVED = "event InterchainTransferReceived(bytes32 indexed commandId, bytes32 indexed tokenId, string sourceChain, bytes sourceAddress, address indexed destinationAddress, uint256 amount, bytes32 dataHash)";

// gateway addresses from https://docs.axelar.dev/resources/contract-addresses/mainnet; Hyperliquid and Monad are
// Amplifier chains whose gateway carries no tokens, so only the ITS is read there
const chainConfig: Record<string, { gateway?: string; deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: { gateway: "0x4F4495243837681061C4743b74B3eEdf548D56A5" },
  [CHAIN.ARBITRUM]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.AVAX]: { gateway: "0x5029C0EFf6C34351a0CEc334542cDb22c7928f78" },
  [CHAIN.BASE]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.BLAST]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.BSC]: { gateway: "0x304acf330bbE08d1e512eefaa92F6a57871fD895" },
  [CHAIN.CELO]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.FANTOM]: { gateway: "0x304acf330bbE08d1e512eefaa92F6a57871fD895" },
  [CHAIN.FRAXTAL]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.IMX]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.KAVA]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.LINEA]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.MANTLE]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  // last volume in the old bridges API on 2026-07-29; every Moonbeam RPC is frozen at 2026-08-10
  [CHAIN.MOONBEAM]: { gateway: "0x4F4495243837681061C4743b74B3eEdf548D56A5", deadFrom: "2026-07-30" },
  [CHAIN.OPTIMISM]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.POLYGON]: { gateway: "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8" },
  [CHAIN.SCROLL]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.HYPERLIQUID]: {},
  [CHAIN.MONAD]: {},
};

const fetch = async (options: FetchOptions) => {
  const { gateway } = chainConfig[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  let tokenSent: any[] = [];
  let callsWithToken: any[] = [];
  let approvedWithMint: any[] = [];
  if (gateway) {
    tokenSent = await options.getLogs({ target: gateway, eventAbi: TOKEN_SENT });
    callsWithToken = await options.getLogs({ target: gateway, eventAbi: CALL_WITH_TOKEN });
    approvedWithMint = await options.getLogs({ target: gateway, eventAbi: APPROVED_WITH_MINT });
  }
  const itsSent = await options.getLogs({ target: ITS, eventAbi: ITS_SENT });
  const itsReceived = await options.getLogs({ target: ITS, eventAbi: ITS_RECEIVED });

  const gatewayLogs = [...tokenSent, ...callsWithToken, ...approvedWithMint];
  const symbols = [...new Set(gatewayLogs.map((l) => l.symbol as string))];
  const symbolTokens = gateway && symbols.length
    ? await options.api.multiCall({ target: gateway, abi: "function tokenAddresses(string) view returns (address)", calls: symbols })
    : [];
  const symbolToken = Object.fromEntries(symbols.map((s, i) => [s, symbolTokens[i]]));

  const tokenIds = [...new Set([...itsSent, ...itsReceived].map((l) => l.tokenId as string))];
  const idTokens = tokenIds.length
    ? await options.api.multiCall({ target: ITS, abi: "function registeredTokenAddress(bytes32) view returns (address)", calls: tokenIds })
    : [];
  const idToken = Object.fromEntries(tokenIds.map((id, i) => [id, idTokens[i]]));

  for (const l of [...tokenSent, ...callsWithToken]) dailyOutgoingVolume.add(symbolToken[l.symbol], l.amount);
  for (const l of approvedWithMint) dailyIncomingVolume.add(symbolToken[l.symbol], l.amount);
  for (const l of itsSent) dailyOutgoingVolume.add(idToken[l.tokenId], l.amount);
  for (const l of itsReceived) dailyIncomingVolume.add(idToken[l.tokenId], l.amount);

  return {
    dailyOutgoingVolume,
    dailyIncomingVolume,
    dailyOutgoingTxCount: tokenSent.length + callsWithToken.length + itsSent.length,
    dailyIncomingTxCount: approvedWithMint.length + itsReceived.length,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    OutgoingVolume: "Value of tokens sent from each EVM chain through the Axelar gateway (token transfers and contract calls with tokens) and the Interchain Token Service.",
    IncomingVolume: "Value of tokens approved for delivery on each EVM chain by the Axelar gateway and delivered by the Interchain Token Service.",
    OutgoingTxCount: "Number of Axelar token transfers sent from each chain.",
    IncomingTxCount: "Number of Axelar token transfers delivered on each chain.",
  },
};

export default adapter;
