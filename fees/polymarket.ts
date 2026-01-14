import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { addTokensReceived } from "../helpers/token"
import ADDRESSES from '../helpers/coreAssets.json'

const FeeModule = '0xE3f18aCc55091e2c48d883fc8C8413319d4Ab7b0';
const NegRiskFeeModule = '0x78769D50Be1763ed1CA0D5E878D93f05aabff29e';

const Ctf = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const NegRiskCtf = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

const FeeRecipient = '0xf21a25DD01ccA63A96adF862F4002d1A186DecB2';

//https://docs.polymarket.com/polymarket-learn/trading/maker-rebates-program
const ProtocolFeeSwitchTime = 1768176000; //2026-01-12

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = await addTokensReceived({
    options,
    fromAdddesses: [FeeModule, NegRiskFeeModule, Ctf, NegRiskCtf],
    target: FeeRecipient,
    token: ADDRESSES.polygon.USDC
  });

  const revenueRatio = options.startOfDay >= ProtocolFeeSwitchTime ? 0.8 : 0;
  const dailyRevenue = dailyFees.clone(revenueRatio);
  const dailySupplySideRevenue = dailyFees.clone(1 - revenueRatio);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay fees when buy/sell binary options on Polymarket markets. Right now taker fees are charged on 15 min markets.Fees taken in USDC are calculated directly using fee modules and those in conditional tokens post redemption. All the fees are net maker fee refunds',
    SupplySideRevenue: 'Part of Fees charged on trades are distributed as maker rebates',
    Revenue: 'Fees going to protocol address post maker rebate distribution',
    ProtocolRevenue: 'All the revenue goes to protocol',
  },
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch,
      start: '2022-09-26',
    }
  },
}

export default adapter
