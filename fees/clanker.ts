import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import CoreAddresses from "../helpers/coreAssets.json";
import { addTokensReceived } from "../helpers/token";

const BUY_BACK_WALLETS = [
  '0x8d4ab2a3e89eadfdc729204adf863a0bfc7746f6',
];

const BUY_BACK_TOKEN = '0x1bc0c42215582d5a085795f4badbac3ff36d1bcb';

const FEE_WALLETS = [
  '0xE85A59c628F7d27878ACeB4bf3b35733630083a9', // clanker_factory
  '0x0E3842123F5823511A406cF4795cF3f06182E58F', // legacy_fee_recipient_v2
  '0x1eaf444ebdf6495c57ad52a04c61521bbf564ace', // legacy_fee_recipient
  '0x04F6ef12a8B6c2346C8505eE4Cff71C43D2dd825', // v0_fee_recipient
]

const fetch = async (options: FetchOptions) => {
  const rawRevenue = await addTokensReceived({
    options,
    targets: FEE_WALLETS,
    tokens: [CoreAddresses.base.WETH],
  });

  const rawBuybacks = await addTokensReceived({
    options,
    targets: BUY_BACK_WALLETS,
    tokens: [BUY_BACK_TOKEN],
  });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Clanker adds 20% of the creator fee on top (e.g. 1% creator + 0.2% protocol = 1.2% total).
  // https://clanker.world/docs/general/creator-rewards-and-fees
  dailyFees.addBalances(rawRevenue.clone(6), "Swap Fees");
  dailyRevenue.addBalances(rawRevenue, "Swap Fees To Protocol");
  dailySupplySideRevenue.addBalances(rawRevenue.clone(5), "Swap Fees To Creators");
  dailyHoldersRevenue.addBalances(rawBuybacks, "Token Buy Back");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total swap fees paid by traders in Clanker-deployed Uniswap v4 pools (creator fee + Clanker's 20% of creator fee).",
  Revenue: "Clanker protocol's cut: 20% of the creator LP fee charged on top of each swap.",
  ProtocolRevenue: "Clanker protocol's cut: 20% of the creator LP fee charged on top of each swap.",
  HoldersRevenue: "CLANKER tokens bought back and distributed to holders.",
  SupplySideRevenue: "Token creator's LP rewards, claimable from the initial single-sided Uniswap v4 position.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Total trading fees accrued in Clanker-deployed Uniswap v4 pools.",
  },
  Revenue: {
    "Swap Fees To Protocol": "Clanker protocol's 20% cut of LP fees, tracked via WETH received by Clanker fee wallets.",
  },
  ProtocolRevenue: {
    "Swap Fees To Protocol": "Clanker protocol's 20% cut of LP fees, tracked via WETH received by Clanker fee wallets.",
  },
  HoldersRevenue: {
    "Token Buy Back": "CLANKER tokens bought back and sent to the buyback wallet.",
  },
  SupplySideRevenue: {
    "Swap Fees To Creators": "Token creator's LP rewards, claimable from the initial single-sided Uniswap v4 position.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2024-11-08",
  methodology,
  breakdownMethodology,
};

export default adapter;
