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

const yieldClaimedEvent = 'event YieldClaimed(address yieldClaimer, address token, uint256 amount)';

const methodology = {
  Fees: "Yield generated from deposited assets in Flying Tulip wrappers.",
  Revenue: "Protocol revenue from claimed yield.",
  ProtocolRevenue: "100% of yield goes to protocol treasury.",
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Fetch YieldClaimed events from all wrappers
  const logs = await options.getLogs({
    targets: WRAPPERS,
    eventAbi: yieldClaimedEvent,
    flatten: true,
  });

  // Each YieldClaimed event contains the token and amount
  logs.forEach((log: any) => {
    const token = log.token;
    const amount = log.amount;
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
      start: '2025-02-20', // PutManager deployment date
    }
  },
  methodology,
}

export default adapter;
