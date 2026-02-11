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

// ftAaveYieldWrapper contract addresses on Ethereum mainnet
const AAVE_WRAPPERS: string[] = [
  '0x038f5e5c4ad747036025ffbae1525926bb0bad68', // SCB
  '0xeee452e8f7bf72f2f42c3ed54acca04b56dcc2a2', // Lemniscap
  '0xc775262245118c7870a3948a7e5dde89bb25ad2d', // Lemniscap 2
  '0x918e1bb8030dc51e34814bcc6a582b8530f1a57d', // Tioga Capital
  '0xa8b2d8de0ef4502ca5e4a2f85abd27fcef28c631', // Hypersphere
  '0x54b56383d79f80e0466eb1e8ccdaa9c189e79032', // Sigil Fund
  '0x7c576cb3ff9f28dce25f181734d1e867304524c1', // Amber Group
  '0xdf6c06f9c7e3807905b387df22ba0397b24381e4', // Paper Ventures
  '0xfb3342c91e8b74975aaa6bd2b740f797fef9d81c', // Fasanara
];

const aaveYieldClaimedEvent = 'event YieldClaimed(address indexed caller, address indexed underlying, address indexed aToken, uint256 amount)';

// PUT Marketplace contract
const PUT_MARKETPLACE = '0x31248663adccdbcad155555b7717697b76cf570c';

// Treasury address
const TREASURY = '0x1118e1c057211306a40A4d7006C040dbfE1370Cb';

// stETH on Ethereum mainnet
const STETH = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';

// ETH cost basis for initial stETH acquisition (2192.99 ETH sent to CoWSwap)
// Used as baseline when start-of-period balance is 0 (acquisition day)
const STETH_COST_BASIS = BigInt('2192990000000000000000');

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
  
  // Fetch YieldClaimed events from ftAaveYieldWrapper contracts
  const aaveLogs = await options.getLogs({
    targets: AAVE_WRAPPERS,
    eventAbi: aaveYieldClaimedEvent,
    flatten: true,
  });

  aaveLogs.forEach((log: any) => {
    dailyFees.add(log.underlying, log.amount, METRIC.ASSETS_YIELDS);
  });

  // Track daily stETH yield via period delta
  // When start balance is 0 (day of acquisition), use STETH_COST_BASIS as baseline
  // so only the conversion gain counts as yield, not the full deposit
  const stethBalanceEnd = await options.api.call({
    abi: 'erc20:balanceOf',
    target: STETH,
    params: [TREASURY],
  });
  const stethBalanceStart = await options.fromApi.call({
    abi: 'erc20:balanceOf',
    target: STETH,
    params: [TREASURY],
  });
  const baseline = BigInt(stethBalanceStart) > 0n ? BigInt(stethBalanceStart) : STETH_COST_BASIS;
  const stethYield = BigInt(stethBalanceEnd) - baseline;
  if (stethYield > 0n) {
    dailyFees.add(STETH, stethYield, METRIC.ASSETS_YIELDS);
  }

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
