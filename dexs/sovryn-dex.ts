import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const SOVRYN_DEX_BOB = "0xe5bc234A484A912A61Aa74501960cFc202e773dA";
const SOVRYN_SWAP_NETWORK_RSK = "0x98aCE08D2b759a265ae326F010496bcD63C15afc";

async function fetchBob({ getLogs, createBalances }: FetchOptions) {
  const dailyVolume = createBalances();

  const logs = await getLogs({
    target: SOVRYN_DEX_BOB,
    eventAbi:
      "event SdexSwap(address indexed base, address indexed quote, uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip, uint128 limitPrice, uint128 minOut, uint8 reserveFlags, int128 baseFlow, int128 quoteFlow)",
  });

  for (const log of logs) {
    const quoteFlow = BigInt(log.quoteFlow);
    const absFlow = quoteFlow < 0n ? -quoteFlow : quoteFlow;
    dailyVolume.add(log.quote, absFlow);
  }

  return { dailyVolume };
}

async function fetchRsk({ getLogs, createBalances }: FetchOptions) {
  const dailyVolume = createBalances();

  const logs = await getLogs({
    target: SOVRYN_SWAP_NETWORK_RSK,
    eventAbi:
      "event Conversion(address indexed _smartToken, address indexed _fromToken, address indexed _toToken, uint256 _fromAmount, uint256 _toAmount, address _trader)",
  });

  for (const log of logs) {
    addOneToken({
      balances: dailyVolume,
      token0: log._fromToken,
      amount0: log._fromAmount,
      token1: log._toToken,
      amount1: log._toAmount,
    });
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BOB]: {
      fetch: fetchBob,
      start: "2024-04-24",
    },
    [CHAIN.ROOTSTOCK]: {
      fetch: fetchRsk,
      start: "2020-09-30",
    },
  },
};

export default adapter;
