import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from '../helpers/token';

const factory = "0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e";
const event_market_create =
  "event MarketCreated (uint256 indexed marketId, address premium, address collateral, address underlyingAsset, address token, string name, uint256 strike, address controller)";

const tokens = [
  ADDRESSES.arbitrum.ARB, // ARB
  ADDRESSES.arbitrum.WETH, // WETH
];
const treasury = "0x5c84cf4d91dc0acde638363ec804792bb2108258";

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, } = options

  const market_create = await getLogs({
    target: factory,
    fromBlock: 96059531,
    eventAbi: event_market_create,
    cacheInCloud: true,
  })

  const premium = market_create.map((e: any) => e.premium.toLowerCase());
  const collateral = market_create.map((e: any) => e.collateral.toLowerCase());
  const vaults = [...new Set([...premium, ...collateral])];
  const dailyFees = createBalances()

  await addTokensReceived({ options, tokens, fromAdddesses: vaults, target: treasury, balances: dailyFees })

  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch as any,
      start: '2023-05-30',
    },
  },
};

export default adapter;
