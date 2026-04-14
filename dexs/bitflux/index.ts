import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IPool {
  address: string;
  tokens: Array<string>;
  swapFeeRate: number;
  adminFeeRate: number; // how many percentage of swap fee
}

const Pools: Array<IPool> = [
  {
    address: '0x4bcb9ea3dacb8ffe623317e0b102393a3976053c',
    tokens: ['0x5B1Fb849f1F76217246B8AAAC053b5C7b15b7dc3', '0x9410e8052Bc661041e5cB27fDf7d9e9e842af2aa', '0x5832f53d147b3d6Cd4578B9CBD62425C7ea9d0Bd'],
    swapFeeRate: 0.0005, // 0.05% per swap
    adminFeeRate: 0.5, // 50% swap fees
  },
  {
    address: '0x6a63cbf00D15137756189c29496B14998b259254',
    tokens: ['0x8BB97A618211695f5a6a889faC3546D1a573ea77', '0x7A6888c85eDBA8E38F6C7E0485212da602761C08', '0x5a2aa871954eBdf89b1547e75d032598356caad5'],
    swapFeeRate: 0.0005, // 0.05% per swap
    adminFeeRate: 0.5, // 50% swap fees
  },
  {
    address: '0xE7E1b1F216d81a4b2c018657f26Eda8FE2F91e26',
    tokens: ['0xe04d21d999FaEDf1e72AdE6629e20A11a1ed14FA', '0xe85411C030fB32A9D8b14Bbbc6CB19417391F711', '0x7A6888c85eDBA8E38F6C7E0485212da602761C08'],
    swapFeeRate: 0.0005, // 0.05% per swap
    adminFeeRate: 0.5, // 50% swap fees
  },
  {
    address: '0x7C59fd4348261348de72be3e40fA87252E778CA3',
    tokens: ['0x5832f53d147b3d6Cd4578B9CBD62425C7ea9d0Bd', '0x7A6888c85eDBA8E38F6C7E0485212da602761C08'],
    swapFeeRate: 0.0005, // 0.05% per swap
    adminFeeRate: 0.5, // 50% swap fees
  },
]

const SwapEvent = 'event TokenSwap(address indexed buyer, uint256 tokensSold, uint256 tokensBought, uint128 soldId, uint128 boughtId)';

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  for (const pool of Pools) {
    const swapEvents = await options.getLogs({
      target: pool.address,
      eventAbi: SwapEvent,
    });
    for (const event of swapEvents) {
      dailyVolume.add(pool.tokens[event.soldId], event.tokensSold);

      const feeAmount = Number(event.tokensSold) * pool.swapFeeRate;
      dailyFees.add(pool.tokens[event.soldId], feeAmount);
      dailyRevenue.add(pool.tokens[event.soldId], feeAmount * pool.adminFeeRate);
    }
  }

  const dailySupplySideRevenue = dailyFees.clone()
  dailySupplySideRevenue.subtract(dailyRevenue)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,

    // no holders revenue
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.CORE]: {
      fetch: fetch,
      start: '2024-11-06',
    }
  },
  methodology: {
    UserFees: "User pays a 0.05% fee on each swap.",
    Fees: "A 0.05% of each swap is collected as trading fees",
    Revenue: "Protocol receives 0.025% of the swap fee (50% of total fees)",
    ProtocolRevenue: "Protocol receives 0.025% of the swap fee (50% of total fees)",
    SupplySideRevenue: "0.025% of the swap fee is distributed to LPs (50% of total fees)",
    HoldersRevenue: "No direct revenue to token holders",
  }
};

export default adapter;
