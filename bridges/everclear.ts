import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Everclear (formerly Connext) intents on each chain's EverclearSpoke.
// https://docs.everclear.org/resources/contracts/mainnet
const spokes: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.OPTIMISM]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.BSC]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.UNICHAIN]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.BASE]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.APECHAIN]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.ARBITRUM]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.SCROLL]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.SONIC]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.BERACHAIN]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.INK]: "0xa05A3380889115bf313f1Db9d5f335157Be4D816",
  [CHAIN.POLYGON]: "0x7189C59e245135696bFd2906b56607755F84F3fD",
  [CHAIN.ERA]: "0x7F5e085981C93C579c865554B9b723B058AaE4D3",
  [CHAIN.RONIN]: "0xdCA40903E271Cc76AECd62dF8D6c19f3Ac873E64",
  [CHAIN.MODE]: "0xeFa6Ac3F931620fD0449eC8c619f2A14A0A78E99",
  [CHAIN.AVAX]: "0x9aA2Ecad5C77dfcB4f34893993f313ec4a370460",
  [CHAIN.ZIRCUIT]: "0xD0E86F280D26Be67A672d1bFC9bB70500adA76fe",
  [CHAIN.LINEA]: "0xc24dC29774fD2c1c0c5FA31325Bb9cbC11D8b751",
  [CHAIN.BLAST]: "0x9ADA72CCbAfe94248aFaDE6B604D1bEAacc899A7",
  [CHAIN.TAIKO]: "0x9ADA72CCbAfe94248aFaDE6B604D1bEAacc899A7",
  [CHAIN.MANTLE]: "0xe0F010e465f15dcD42098dF9b99F1038c11B3056",
  // solana (everUnMiUkvZG8EyXAtW8HfMavCBTVeMhQszbrtpUQm): non-EVM, not covered
};

const fetch = async (options: FetchOptions) => {
  const target = spokes[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  const added = await options.getLogs({
    target,
    eventAbi: "event IntentAdded(bytes32 indexed _intentId, uint256 _queueId, (bytes32 initiator, bytes32 receiver, bytes32 inputAsset, bytes32 outputAsset, uint24 maxFee, uint32 origin, uint64 nonce, uint48 timestamp, uint48 ttl, uint256 amount, uint32[] destinations, bytes data) _intent)",
  });
  const settled = await options.getLogs({ target, eventAbi: "event Settled(bytes32 indexed _intentId, address _account, address _asset, uint256 _amount)" });

  // bytes32 asset -> address, then undo the 18-decimal normalization with the token's own decimals
  const assetOf = (log: any) => "0x" + String(log._intent.inputAsset).slice(26).toLowerCase();
  const assets = [...new Set(added.map(assetOf))];
  const decimals: number[] = await options.api.multiCall({ abi: "erc20:decimals", calls: assets });
  const decimalsOf = Object.fromEntries(assets.map((asset, i) => [asset, Number(decimals[i])]));

  for (const log of added) {
    const asset = assetOf(log);
    const amount = BigInt(log._intent.amount);
    const dec = decimalsOf[asset];
    dailyOutgoingVolume.add(asset, dec <= 18 ? amount / 10n ** BigInt(18 - dec) : amount * 10n ** BigInt(dec - 18));
  }
  for (const log of settled) dailyIncomingVolume.add(log._asset, log._amount);

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: added.length, dailyIncomingTxCount: settled.length };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: Object.keys(spokes),
  start: "2025-05-17", // first day the old bridges server recorded Everclear volume
  methodology: {
    OutgoingVolume: "Value of Everclear intents created on each chain, i.e. funds deposited to be delivered on another chain.",
    IncomingVolume: "Value of Everclear intents settled on each chain, i.e. funds delivered to recipients there.",
    OutgoingTxCount: "Number of Everclear intents created on each chain.",
    IncomingTxCount: "Number of Everclear intents settled on each chain.",
  },
};

export default adapter;
