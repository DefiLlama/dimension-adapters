import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Garden atomic swaps through per-asset HTLC contracts. A swap locks the user's tokens in the source chain's HTLC
// (redeemed later by the solver) and the solver's tokens in the destination chain's HTLC (redeemed by the user).
// Only the user legs are counted: transfers into an HTLC from anyone but the solver are outgoing, transfers out of an
// HTLC to anyone but the solver are incoming, except refunds (txs with a Refunded event).
// HTLC and solver addresses from https://api.garden.finance/v2/assets, plus retired HTLCs from the old bridges-server
// adapter.
const SOLVER = "0x18e489f22461281879e1d161c55668b7a521a3a9";
const TRANSFER = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const REFUNDED = "event Refunded(bytes32 indexed orderID)";

// [htlc, token]
const chainConfig: Record<string, { htlcs: [string, string][] }> = {
  [CHAIN.ETHEREUM]: {
    htlcs: [
      ["0xD781a2abB3FCB9fC0D1Dd85697c237d06b75fe95", ADDRESSES.ethereum.WBTC], // WBTC
      ["0xCF5E5e28848cFe779f7Fb711C57857Cb3b144A19", ADDRESSES.ethereum.USDT], // USDT
      ["0x5fA58e4E89c85B8d678Ade970bD6afD4311aF17E", ADDRESSES.ethereum.USDC], // USDC
      ["0xe35d025d0f0d9492db4700FE8646f7F89150eC04", ADDRESSES.ethereum.cbBTC], // cbBTC
      ["0xDC74a45e86DEdf1fF7c6dac77e0c2F082f9E4F72", "0x20157DBAbb84e3BBFE68C349d0d44E48AE7B5AD2"], // iBTC (retired)
    ],
  },
  [CHAIN.ARBITRUM]: {
    htlcs: [
      ["0xb5AE9785349186069C48794a763DB39EC756B1cF", ADDRESSES.arbitrum.WBTC], // WBTC
      ["0xeae7721d779276eb0f5837e2fe260118724a2ba4", ADDRESSES.arbitrum.USDC_CIRCLE], // USDC (retired)
      ["0x7e8c18fa79bd4014cfCf49294Bf315139eD39f45", "0x050C24dBf1eEc17babE5fc585F06116A259CC77A"], // iBTC (retired)
    ],
  },
  [CHAIN.BASE]: {
    htlcs: [
      ["0xe35d025d0f0d9492db4700FE8646f7F89150eC04", ADDRESSES.ethereum.cbBTC], // cbBTC
      ["0x227A436e93AAEf856ed406713F2bc3D110A7b797", ADDRESSES.base.USDC], // USDC
      ["0xd8a6e3fca403d79b6ad6216b60527f51cc967d39", ADDRESSES.base.USDC], // USDC (retired)
      ["0x7aE2D05e6fD9F12A9D4bA5C61384F4D0b90843eb", "0xcb17C9Db87B595717C857a08468793f5bAb6445F"], // cbLTC
    ],
  },
  [CHAIN.BSC]: {
    htlcs: [["0xe74784E5A45528fDEcB257477DD6bd31c8ef0761", ADDRESSES.bsc.BTCB]], // BTCB
  },
  [CHAIN.HYPERLIQUID]: {
    htlcs: [
      ["0xDC74a45e86DEdf1fF7c6dac77e0c2F082f9E4F72", "0x9FDBdA0A5e284c32744D2f17Ee5c74B284993463"], // uBTC
      ["0x6DBbE6f4caac769af76C5621d901d0fD9B1f5494", ADDRESSES.hyperliquid.USDC], // USDC to HyperCore
      ["0xcA1dd4724482CFFBdabA540ABf96E3389526Af72", ADDRESSES.hyperliquid.USDC], // USDC to HyperCore perps
    ],
  },
  [CHAIN.UNICHAIN]: {
    htlcs: [
      ["0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39", "0x927B51f251480a681271180DA4de28D44EC4AfB8"], // WBTC (retired)
      ["0x795Dcb58d1cd4789169D5F938Ea05E17ecEB68cA", ADDRESSES.unichain.USDC], // USDC (retired)
    ],
  },
  [CHAIN.BERACHAIN]: {
    htlcs: [["0x39f3294352208905fc6ebf033954E6c6455CdB4C", ADDRESSES.bsc.LBTC]], // LBTC (retired)
  },
  [CHAIN.MEGAETH]: {
    htlcs: [["0x52b4d144059CB17724D352034b15A8eaE2F29FA7", ADDRESSES.ethereum.BTC_b]], // BTC.b (retired)
  },
};

const pad = (address: string) => "0x" + address.toLowerCase().slice(2).padStart(64, "0");

const fetch = async (options: FetchOptions) => {
  const { htlcs } = chainConfig[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  const refunds = await options.getLogs({ targets: htlcs.map(([htlc]) => htlc), eventAbi: REFUNDED, onlyArgs: false });
  const refundTxs = new Set(refunds.map((l: any) => l.transactionHash.toLowerCase()));

  for (const [htlc, token] of htlcs) {
    const locks = await options.getLogs({ target: token, eventAbi: TRANSFER, topics: [TRANSFER_TOPIC, null, pad(htlc)] });
    const releases = await options.getLogs({ target: token, eventAbi: TRANSFER, topics: [TRANSFER_TOPIC, pad(htlc)], onlyArgs: false });
    for (const l of locks) {
      if (l.from.toLowerCase() === SOLVER) continue;
      dailyOutgoingVolume.add(token, l.value);
      dailyOutgoingTxCount++;
    }
    for (const l of releases) {
      if (l.args.to.toLowerCase() === SOLVER || refundTxs.has(l.transactionHash.toLowerCase())) continue;
      dailyIncomingVolume.add(token, l.args.value);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: Object.keys(chainConfig),
  methodology: {
    OutgoingVolume: "Value of tokens users lock in Garden's swap contracts on each EVM chain. Bitcoin, Litecoin, Lightning and Spark legs are not counted.",
    IncomingVolume: "Value of tokens users redeem from Garden's swap contracts on each EVM chain, excluding refunds. Bitcoin, Litecoin, Lightning and Spark legs are not counted.",
    OutgoingTxCount: "Number of user locks in Garden's swap contracts on each chain.",
    IncomingTxCount: "Number of user redeems from Garden's swap contracts on each chain.",
  },
};

export default adapter;
