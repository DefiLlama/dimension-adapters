import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Squid routes cross-chain swaps through Axelar: the Squid router calls the Axelar gateway (callContractWithToken /
// sendToken) or the Interchain Token Service, so those events carry the router as sender. Volume is the token amount of
// those events on the source chain, so each routed transfer is counted once.
// Router: https://etherscan.io/address/0xce16F69375520ab01377ce7B88f5BA8C48F8D666 (SquidRouterProxy). Squid's other
// routes (CCTP, Chainflip, Coral) are not counted: on 2026-09-29 no CCTP burn on Ethereum, Arbitrum or Base had the
// router as depositor, and the Coral spokes have had no orders since 2026-06-18.
const ROUTER = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666";
const ITS = "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C";

const TOKEN_SENT = "event TokenSent(address indexed sender, string destinationChain, string destinationAddress, string symbol, uint256 amount)";
const CALL_WITH_TOKEN = "event ContractCallWithToken(address indexed sender, string destinationChain, string destinationContractAddress, bytes32 indexed payloadHash, bytes payload, string symbol, uint256 amount)";
const ITS_SENT = "event InterchainTransfer(bytes32 indexed tokenId, address indexed sourceAddress, string destinationChain, bytes destinationAddress, uint256 amount, bytes32 indexed dataHash)";

// Axelar gateway per chain (https://docs.axelar.dev/resources/contract-addresses/mainnet); Blast and Fraxtal use their own router
const chainConfig: Record<string, { gateway: string; router?: string; deadFrom?: string }> = {
  [CHAIN.ETHEREUM]: { gateway: "0x4F4495243837681061C4743b74B3eEdf548D56A5" },
  [CHAIN.ARBITRUM]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.AVAX]: { gateway: "0x5029C0EFf6C34351a0CEc334542cDb22c7928f78" },
  [CHAIN.BASE]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.BLAST]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31", router: "0x492751eC3c57141deb205eC2da8bFcb410738630" },
  [CHAIN.BSC]: { gateway: "0x304acf330bbE08d1e512eefaa92F6a57871fD895" },
  [CHAIN.CELO]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.FANTOM]: { gateway: "0x304acf330bbE08d1e512eefaa92F6a57871fD895" },
  [CHAIN.FILECOIN]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.FRAXTAL]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31", router: "0xDC3D8e1Abe590BCa428a8a2FC4CfDbD1AcF57Bd9" },
  [CHAIN.IMX]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.LINEA]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.MANTLE]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  // last Squid volume in the old bridges API on 2026-07-31; every Moonbeam RPC is frozen at 2026-08-10
  [CHAIN.MOONBEAM]: { gateway: "0x4F4495243837681061C4743b74B3eEdf548D56A5", deadFrom: "2026-08-01" },
  [CHAIN.OPTIMISM]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
  [CHAIN.POLYGON]: { gateway: "0x6f015F16De9fC8791b234eF68D486d2bF203FBA8" },
  [CHAIN.SCROLL]: { gateway: "0xe432150cce91c13a887f7D836923d5597adD8E31" },
};

const fetch = async (options: FetchOptions) => {
  const { gateway, router = ROUTER } = chainConfig[options.chain];
  const isRouter = (address: string) => address.toLowerCase() === router.toLowerCase();
  const dailyBridgeVolume = options.createBalances();

  const tokenSent = (await options.getLogs({ target: gateway, eventAbi: TOKEN_SENT })).filter((l: any) => isRouter(l.sender));
  const callsWithToken = (await options.getLogs({ target: gateway, eventAbi: CALL_WITH_TOKEN })).filter((l: any) => isRouter(l.sender));
  const itsSent = (await options.getLogs({ target: ITS, eventAbi: ITS_SENT })).filter((l: any) => isRouter(l.sourceAddress));

  const gatewayLogs = [...tokenSent, ...callsWithToken];
  const symbols = [...new Set(gatewayLogs.map((l: any) => l.symbol as string))];
  const symbolTokens = symbols.length
    ? await options.api.multiCall({ target: gateway, abi: "function tokenAddresses(string) view returns (address)", calls: symbols })
    : [];
  const symbolToken = Object.fromEntries(symbols.map((s, i) => [s, symbolTokens[i]]));

  const tokenIds = [...new Set(itsSent.map((l: any) => l.tokenId as string))];
  const idTokens = tokenIds.length
    ? await options.api.multiCall({ target: ITS, abi: "function registeredTokenAddress(bytes32) view returns (address)", calls: tokenIds })
    : [];
  const idToken = Object.fromEntries(tokenIds.map((id, i) => [id, idTokens[i]]));

  for (const l of gatewayLogs) dailyBridgeVolume.add(symbolToken[l.symbol], l.amount);
  for (const l of itsSent) dailyBridgeVolume.add(idToken[l.tokenId], l.amount);

  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    BridgeVolume: "Value of tokens Squid's router sends cross-chain through Axelar (gateway token transfers and contract calls with tokens, and Interchain Token Service transfers), counted on the source chain.",
  },
};

export default adapter;
