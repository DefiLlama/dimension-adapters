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
// - Across (since 2026-10-22): one deposit into the SpokePool of the chain paid from, whose message holds the
//   instructions Across's handler runs on arrival, among them paying Scrooge's fee to Scrooge's fee wallet. A
//   FundsDeposited log whose message carries that wallet is Scrooge's.
//   SpokePools: https://github.com/across-protocol/contracts/blob/master/deployments/deployments.json
//
// Diamond addresses: helpers/aggregators/lifi.ts (LifiDiamonds), https://github.com/lifinance/contracts/tree/main/deployments

const LifiBridgeEvent = "event LiFiTransferStarted((bytes32 transactionId, string bridge, string integrator, address referrer, address sendingAssetId, address receiver, uint256 minAmount, uint256 destinationChainId, bool hasSourceSwaps, bool hasDestinationCall) bridgeData)";
const LIFI_INTEGRATOR = "scrooge";
const AcrossDepositEvent = "event FundsDeposited(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 indexed destinationChainId, uint256 indexed depositId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 indexed depositor, bytes32 recipient, bytes32 exclusiveRelayer, bytes message)";
const FEE_WALLET = "d21ba2ac73e7e825f929d4b2f70228e806f439ae";
const ACROSS_START = "2026-10-22";
// The SpokePools Scrooge deposits into, by chain.
const ACROSS_SPOKE_POOLS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5",
  [CHAIN.OPTIMISM]: "0x6f26Bf09B1C792e3228e5467807a900A503c0281",
  [CHAIN.UNICHAIN]: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  [CHAIN.POLYGON]: "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096",
  [CHAIN.MONAD]: "0xd2ecb3afe598b746F8123CaE365a598DA831A449",
  [CHAIN.WC]: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  [CHAIN.HYPERLIQUID]: "0x35E63eA3eb0fb7A3bc543C71FB66412e1F6B0E04",
  [CHAIN.SONEIUM]: "0x3baD7AD0728f9917d1Bf08af5782dCbD516cDd96",
  [CHAIN.MEGAETH]: "0x3Db06DA8F0a24A525f314eeC954fC5c6a973d40E",
  [CHAIN.ROBINHOOD]: "0xD29C85F15DF544bA632C9E25829fd29d767d7978",
  [CHAIN.BASE]: "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64",
  [CHAIN.ARBITRUM]: "0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A",
  [CHAIN.AVAX]: "0xFE9D541c92E4e90437C7152A00244886dE37a658",
  [CHAIN.INK]: "0xeF684C38F94F48775959ECf2012D7E864ffb9dd4",
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

const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const relay: RelayTotals = options.preFetchedResults;
  dailyBridgeVolume.addUSDValue(relay.crossChain[options.chain] ?? 0);

  const spokePool = ACROSS_SPOKE_POOLS[options.chain];
  if (spokePool && options.endTimestamp > Date.parse(ACROSS_START) / 1000) {
    const deposits = await options.getLogs({ target: spokePool, eventAbi: AcrossDepositEvent });
    for (const log of deposits) {
      if (String(log.message).toLowerCase().includes(FEE_WALLET)) dailyBridgeVolume.add("0x" + String(log.inputToken).slice(26), log.inputAmount);
    }
  }

  if (!LIFI_CHAINS.includes(options.chain)) return { dailyBridgeVolume };

  if (options.chain === CHAIN.SOLANA) {
    // LI.FI's Solana program emits no EVM logs
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
  pullHourly: true,
  fetch,
  prefetch: fetchRelayTotals as any,
  adapter: Object.fromEntries([
    ...LIFI_CHAINS.map((chain) => [chain, { start: LIFI_START }]),
    ...RELAY_ONLY_CHAINS.map((chain) => [chain, { start: RELAY_START }]),
  ]),
  methodology: {
    BridgeVolume: 'Cross-chain volume Scrooge routes, on the sending chain: through LI.FI under the integrator "scrooge", the sent amount of every LiFiTransferStarted log carrying it (from Solana, LI.FI\'s analytics API for the same integrator); through Relay, the USD value Relay reports sent in every filled request under Scrooge\'s Relay app id; through Across, the input amount of every FundsDeposited log on the sending chain\'s SpokePool whose message pays Scrooge\'s fee wallet.',
  },
};

export default adapter;
