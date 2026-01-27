import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Flying Tulip yield wrapper contract addresses on Ethereum mainnet
const WRAPPERS: string[] = [
  '0x095d8B8D4503D590F647343F7cD880Fa2abbbf59', // USDC Wrapper
  '0x9d96bac8a4E9A5b51b5b262F316C4e648E44E305', // WETH Wrapper
  '0x267dF6b637DdCaa7763d94b64eBe09F01b07cB36', // USDT Wrapper
  '0xA143a9C486a1A4aaf54FAEFF7252CECe2d337573', // USDS Wrapper
  '0xE5270E0458f58b83dB3d90Aa6A616173c98C97b6', // USDTb Wrapper
  '0xe6880Fc961b1235c46552E391358A270281b5625', // USDe Wrapper
];

// PUT Marketplace contract
const PUT_MARKETPLACE = '0x31248663adccdbcad155555b7717697b76cf570c';

// Treasury address
const TREASURY = '0x1118e1c057211306a40A4d7006C040dbfE1370Cb';

const yieldClaimedEvent = 'event YieldClaimed(address yieldClaimer, address token, uint256 amount)';
const transferEvent = 'event Transfer(address indexed from, address indexed to, uint256 value)';

const methodology = {
  Fees: "Yield generated from deposited assets in Flying Tulip wrappers plus marketplace fees from PUT trades.",
  Revenue: "Protocol revenue from claimed yield and marketplace fees.",
  ProtocolRevenue: "100% of yield and marketplace fees go to protocol treasury.",
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Fetch YieldClaimed events from all wrappers
  const yieldLogs = await options.getLogs({
    targets: WRAPPERS,
    eventAbi: yieldClaimedEvent,
    flatten: true,
  });

  // Each YieldClaimed event contains the token and amount
  yieldLogs.forEach((log: any) => {
    const token = log.token;
    const amount = log.amount;
    dailyFees.add(token, amount);
    dailyRevenue.add(token, amount);
  });

  // Fetch marketplace fees - Transfer events from PUT marketplace to treasury
  // Transfer events are emitted by token contracts, so we query by topics (from=marketplace, to=treasury)
  const marketplaceLogs = await options.getLogs({
    noTarget: true,
    topics: [
      '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer(address,address,uint256)
      '0x00000000000000000000000031248663adccdbcad155555b7717697b76cf570c', // from = PUT marketplace (padded)
      '0x0000000000000000000000001118e1c057211306a40a4d7006c040dbfe1370cb', // to = treasury (padded)
    ],
  });

  // Each Transfer event to treasury is a marketplace fee
  // The token is the contract that emitted the event (log.address)
  marketplaceLogs.forEach((log: any) => {
    const token = log.address;
    const amount = log.data; // amount is in data for non-indexed Transfer
    dailyFees.add(token, amount);
    dailyRevenue.add(token, amount);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2026-01-20', // First YieldClaimed event
    }
  },
  methodology,
}

export default adapter;
