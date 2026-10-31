import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchRelayTotals, RELAY_START, RelayTotals } from "../../aggregators/scrooge/relay";
import { fetchVolumeFromLIFIAPI, LifiDiamonds } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";

// Scrooge (https://scrooge.exchange) - swap aggregator on Robinhood Chain, whose Swap & Bridge moves coins between
// Robinhood Chain and other chains through LI.FI, Relay and Across, counted on the sending chain. Same-chain swaps are in
// aggregators/scrooge.
// - LI.FI: routes are sent under the integrator string "scrooge", so they are the LiFiTransferStarted logs carrying
//   that integrator (the same event as bridge-aggregators/lifi and bridge-aggregators/hyperdex). Solana has no logs
//   indexer here and is read from LI.FI's analytics API, filtered by the same integrator.
// - Relay: requests under Scrooge's Relay app id (aggregators/scrooge/relay.ts), read from Relay's requests API.
// - Across (since 2026-10-22): one deposit into the SpokePool of the chain paid from, to Across's MulticallHandler on
//   the chain paid to, whose message holds the instructions the handler runs on arrival, among them paying Scrooge's
//   fee to Scrooge's fee wallet. A FundsDeposited log to that handler whose decoded instructions pay that wallet a
//   nonzero fee is Scrooge's.
//   SpokePools: https://github.com/across-protocol/contracts/blob/master/deployments/deployments.json
//   Instructions: https://github.com/across-protocol/contracts/blob/master/contracts/handlers/MulticallHandler.sol
//
// Diamond addresses: helpers/aggregators/lifi.ts (LifiDiamonds), https://github.com/lifinance/contracts/tree/main/deployments

const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)";
const LIFI_INTEGRATOR = "scrooge";
const AcrossDepositEvent = "event FundsDeposited(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint256 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 indexed depositor, bytes32 recipient, bytes32 exclusiveRelayer, bytes message)";
const FEE_WALLET = "0xd21ba2ac73e7e825f929d4b2f70228e806f439ae";
const ACROSS_START = "2026-10-22";
// MulticallHandler's Instructions struct: the calls it makes on arrival, and who gets the tokens if one fails.
const ACROSS_INSTRUCTIONS = ["tuple(tuple(address target, bytes callData, uint256 value)[] calls, address fallbackRecipient)"];
const ERC20_TRANSFER = "0xa9059cbb"; // transfer(address,uint256)
// The MulticallHandler a deposit to each destination chain id is paid to, the recipient Across's Swap API sets for
// Scrooge's routes: MulticallHandler in deployments.json (above), the same address on most chains. Robinhood Chain's is
// not in that file; it is the one Across's API names, with the same code as Avalanche's and MegaETH's handlers.
const MULTICALL_HANDLER = "0x0f7ae28de1c8532170ad4ee566b5801485c13a0e";
const ACROSS_HANDLERS: Record<string, string> = {
  1: MULTICALL_HANDLER, 10: MULTICALL_HANDLER, 130: MULTICALL_HANDLER, 137: MULTICALL_HANDLER, 480: MULTICALL_HANDLER,
  1868: MULTICALL_HANDLER, 8453: MULTICALL_HANDLER, 42161: MULTICALL_HANDLER, 57073: MULTICALL_HANDLER,
  143: "0xec41f75c686e376ab2a4f18bde263ab5822c4511", // Monad
  999: "0x5e7840e06faccb6d1c3b5f5e0d1d3d07f2829bba", // HyperEVM
  4326: "0xffc1285082deab9bf0eca5699e4930bb310afbe4", // MegaETH
  4663: "0xa8ad2e87e2043711d8bec77e8bc3e2683c0ab6bd", // Robinhood Chain
  43114: "0x9610954acdca5ff7905f051a040ce33fe613c60e", // Avalanche
  59144: "0xdf1c940487574eefa79989a79a4936a0f979cda2", // Linea
};
// The SpokePools Scrooge deposits into, by chain: the chains Scrooge's Across deposits come from, Ethereum above all,
// and the larger chains it offers Across on. Its smaller Across chains (World Chain, HyperEVM, Monad, MegaETH,
// Soneium, Ink) are left out until Scrooge's volume there is worth a day of their logs.
const ACROSS_SPOKE_POOLS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5",
  [CHAIN.OPTIMISM]: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
  [CHAIN.UNICHAIN]: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  [CHAIN.POLYGON]: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
  [CHAIN.ROBINHOOD]: "0xD29C85F15DF544bA632C9E25829fd29d767d7978",
  [CHAIN.BASE]: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  [CHAIN.ARBITRUM]: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
  [CHAIN.AVAX]: "0xFE9D541c92E4e90437C7152A00244886dE37a658",
  [CHAIN.LINEA]: "0x7E63A5f1a8F0B4d0934B2f2327DAED3F6bb2ee75",
};
// The first transfer under Scrooge's LI.FI integrator string, 2026-10-12.
const LIFI_START = "2026-10-12";
const LIFI_CHAINS: string[] = [CHAIN.ROBINHOOD, CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.BSC, CHAIN.SOLANA];
// The chains Swap & Bridge pays from through Relay or Across besides those: the EVM chains it lists, and Bitcoin.
// Relay came first on them (2026-10-14), Across after (2026-10-22).
const RELAY_ONLY_CHAINS: string[] = [
  CHAIN.OPTIMISM, CHAIN.POLYGON, CHAIN.HYPERLIQUID, CHAIN.MONAD, CHAIN.AVAX, CHAIN.PLASMA, CHAIN.INK, CHAIN.CRONOS, CHAIN.MANTLE,
  CHAIN.XDAI, CHAIN.WC, CHAIN.KATANA, CHAIN.BERACHAIN, CHAIN.UNICHAIN, CHAIN.LINEA, CHAIN.BLAST, CHAIN.SONIC, CHAIN.ERA, CHAIN.CELO,
  CHAIN.MEGAETH, CHAIN.RONIN, CHAIN.SCROLL, CHAIN.SONEIUM, CHAIN.ABSTRACT, CHAIN.BITCOIN,
];

const lastAddress = (word: string) => "0x" + String(word).slice(-40).toLowerCase();

// Whether a deposit is Scrooge's: paid to the destination chain's MulticallHandler, which alone runs its message as
// Instructions, and those instructions pay Scrooge's fee, a nonzero amount of the token that arrives transferred to the
// fee wallet or, where ETH arrives, nonzero ETH sent to it with no calldata. A message that does not decode as
// Instructions is not Scrooge's. The fee is paid on arrival on the other chain; volume is counted at the deposit.
function paysScroogeFee(recipient: string, destinationChainId: string, message: string, outputToken: string): boolean {
  if (recipient !== ACROSS_HANDLERS[destinationChainId] || !message || message === "0x") return false;
  const coder = ethers.AbiCoder.defaultAbiCoder();
  let calls: { target: string; callData: string; value: bigint }[];
  try {
    calls = coder.decode(ACROSS_INSTRUCTIONS, message)[0].calls;
  } catch {
    return false;
  }
  return calls.some(({ target, callData, value }) => {
    if (target.toLowerCase() === FEE_WALLET) return callData === "0x" && value > 0n;
    if (target.toLowerCase() !== outputToken || value !== 0n || !callData.startsWith(ERC20_TRANSFER)) return false;
    try {
      const [to, amount] = coder.decode(["address", "uint256"], "0x" + callData.slice(10));
      return String(to).toLowerCase() === FEE_WALLET && amount > 0n;
    } catch {
      return false;
    }
  });
}

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const relay: RelayTotals = options.preFetchedResults;
  dailyBridgeVolume.addUSDValue(relay.crossChain[options.chain] ?? 0);

  const spokePool = ACROSS_SPOKE_POOLS[options.chain];
  if (spokePool && options.endTimestamp > Date.parse(ACROSS_START) / 1000) {
    const deposits = await options.getLogs({ target: spokePool, eventAbi: AcrossDepositEvent, maxBlockRange: 10000 });
    for (const log of deposits) {
      if (paysScroogeFee(lastAddress(log.recipient), String(log.destinationChainId), String(log.message), lastAddress(log.outputToken))) dailyBridgeVolume.add(lastAddress(log.inputToken), log.inputAmount);
    }
  }

  if (!LIFI_CHAINS.includes(options.chain)) return { dailyBridgeVolume };

  if (options.chain === CHAIN.SOLANA) {
    // LI.FI's Solana program emits no EVM logs. The helper keeps transfers in [start, end), and since #10547 the runner's
    // startTimestamp is the window's first second, so adjacent windows share none.
    dailyBridgeVolume.addUSDValue(await fetchVolumeFromLIFIAPI(options.chain, options.startTimestamp, options.endTimestamp, [LIFI_INTEGRATOR], [], "cross-chain"));
    return { dailyBridgeVolume };
  }
  const logs = await options.getLogs({ target: LifiDiamonds[options.chain].id, eventAbi: LifiBridgeEvent, maxBlockRange: 10000 });
  for (const log of logs) {
    const { integrator, sendingAssetId, minAmount } = log.bridgeData;
    if (integrator === LIFI_INTEGRATOR) dailyBridgeVolume.add(sendingAssetId, minAmount);
  }
  return { dailyBridgeVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Pulled a day at a time: each window reads Relay's requests API and the logs of every listed chain, and read hourly
  // the smaller chains' public RPCs refused (World Chain answered 400 and 429 in this adapter's first test).
  pullHourly: false,
  fetch,
  prefetch: fetchRelayTotals as any,
  adapter: Object.fromEntries([
    ...LIFI_CHAINS.map((chain) => [chain, { start: LIFI_START }]),
    ...RELAY_ONLY_CHAINS.map((chain) => [chain, { start: RELAY_START }]),
  ]),
  methodology: {
    BridgeVolume: 'Cross-chain volume Scrooge routes, on the sending chain: through LI.FI under the integrator "scrooge", the sent amount of every LiFiTransferStarted log carrying it (from Solana, LI.FI\'s analytics API for the same integrator); through Relay, the USD value Relay reports sent in every filled request under Scrooge\'s Relay app id; through Across, the input amount of every FundsDeposited log on the sending chain\'s SpokePool paid to Across\'s MulticallHandler on the receiving chain whose message, decoded as that handler\'s instructions, pays a nonzero fee to Scrooge\'s fee wallet.',
  },
};

export default adapter;
