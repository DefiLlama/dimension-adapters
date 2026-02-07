import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

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

// PUT Marketplace contract
const PUT_MARKETPLACE = '0x31248663adccdbcad155555b7717697b76cf570c';

// Treasury address
const TREASURY = '0x1118e1c057211306a40A4d7006C040dbfE1370Cb';

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

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
    dailyFees.add(token, amount, METRIC.ASSETS_YIELDS);
  });
  
  const tokenReceived = await addTokensReceived({
    options,
    target: TREASURY,
    fromAdddesses: [PUT_MARKETPLACE],
  })
  dailyFees.add(tokenReceived, 'Marketplace Fees');

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
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
  methodology: {
    Fees: "Yield generated from deposited assets in Flying Tulip wrappers + marketplace fees from PUT trades.",
    Revenue: "Protocol revenue from claimed yield.",
    ProtocolRevenue: "100% of yield goes to protocol treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: 'Yield generated from deposited assets in Flying Tulip wrappers.',
      'Marketplace Fees': 'Marketplace fees from PUT trades.',
    },
    Revenue: {
      [METRIC.ASSETS_YIELDS]: 'Yield generated from deposited assets in Flying Tulip wrappers.',
      'Marketplace Fees': 'Marketplace fees from PUT trades.',
    },
    ProtocolRevenue: {
      [METRIC.ASSETS_YIELDS]: 'Yield generated from deposited assets in Flying Tulip wrappers.',
      'Marketplace Fees': 'Marketplace fees from PUT trades.',
    },
  }
}

export default adapter;
