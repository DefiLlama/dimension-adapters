import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
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

// https://dune.com/queries/5768935/9358569
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  // count WETH received by fee wallets
  const dailyRevenue = await addTokensReceived({
    options,
    targets: FEE_WALLETS,
    tokens: [CoreAddresses.base.WETH],
  })

  const dailyHoldersRevenue = await addTokensReceived({
    options,
    targets: BUY_BACK_WALLETS,
    tokens: [BUY_BACK_TOKEN],
  })

  return {
    dailyFees: dailyRevenue.clone(5), // revenue is 20% fees
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BASE],
  start: "2024-11-08",
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: "All trading and launching tokens fees paid by users.",
    Revenue: "Clanker protocol collects 20% of LP fees.",
    ProtocolRevenue: "Clanker protocol collects 20% of LP fees.",
    HoldersRevenue: "Amount of CLANKER tokens buy back.",
  }
};

export default adapter;
