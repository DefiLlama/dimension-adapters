import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Vesper 2 (the backend of Odyssey Earn) on Ethereum mainnet.
// Users mint USDv/ETHv 1:1 against USDC/WETH, which the instance Treasury deposits into a whitelisted
// Vesper YieldVault (the Treasury is its only depositor). The YieldManager harvests the strategy profit
// and streams it to sUSDv/sETHv stakers over 7 days, which shows up as share price growth of the
// staking vaults. Addresses: https://docs.vesper.finance/vesper-2/contract-addresses
const INSTANCES = [
  { // Vesper USD (USDv / sUSDv)
    asset: ADDRESSES.ethereum.USDC, assetDecimals: 6,
    yieldVault: "0x3aEd4dd0b5ba616156Fa352274670c18D2Ec2A81", // vwvUSDC
    stakingVault: "0x7473Da16F17abA0D920605e1F9560A99a6F6314A", // sUSDv
  },
  { // Vesper ETH (ETHv / sETHv)
    asset: ADDRESSES.ethereum.WETH, assetDecimals: 18,
    yieldVault: "0x025a05f1967521806BB4c8a10Ba4b8c00A794F65", // vwvWETH
    stakingVault: "0x1E0cFbFA5BD27beC4e26b7fE6F4b55E83C2b4a2c", // sETHv
  },
];

const INSTANT_UNSTAKE_FEES = "Instant Unstake Fees";
const ONE_SHARE = "1000000000000000000";
const CONVERT_TO_ASSETS = "function convertToAssets(uint256 shares) view returns (uint256 assets)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const stakingVaults = INSTANCES.map(({ stakingVault }) => stakingVault);
  const ppsCalls = stakingVaults.map((target) => ({ target, params: [ONE_SHARE] }));
  const ppsStart: string[] = await options.fromApi.multiCall({ abi: CONVERT_TO_ASSETS, calls: ppsCalls });
  const ppsEnd: string[] = await options.toApi.multiCall({ abi: CONVERT_TO_ASSETS, calls: ppsCalls });
  const sharesStart: string[] = await options.fromApi.multiCall({ abi: "uint256:totalSupply", calls: stakingVaults });

  for (const [i, { asset, assetDecimals, yieldVault, stakingVault }] of INSTANCES.entries()) {
    // sUSDv/sETHv shares and USDv/ETHv are 18 decimals, redeemable 1:1 for the 6-dec USDC / 18-dec WETH
    const toAsset = (amount: bigint) => amount / 10n ** BigInt(18 - assetDecimals);

    // yield streamed to stakers = share price growth x share supply at the window start
    const yieldToStakers = toAsset((BigInt(ppsEnd[i]) - BigInt(ppsStart[i])) * BigInt(sharesStart[i]) / 10n ** 18n);
    dailyFees.add(asset, yieldToStakers, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(asset, yieldToStakers, METRIC.ASSETS_YIELDS);

    // performance fee (0 bps since launch, listed in the docs' fee table) is minted out of strategy profit as
    // yield vault shares to the strategy fee collector (0x45ff0e3b..., the Vesper fee recipient) before the
    // rest reaches stakers, so it is added back on top of the share price growth
    const performanceFees = await options.getLogs({ target: yieldVault, eventAbi: "event PerformanceFeePaid(address indexed strategy, uint256 strategyDebt, uint256 profit, uint256 fee)" });
    for (const { fee } of performanceFees) {
      dailyFees.add(asset, fee, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(asset, fee, METRIC.PERFORMANCE_FEES);
    }

    // 10 bps charged on sUSDv/sETHv unstakes that skip the 7-day cooldown, paid to the Vesper treasury multisig
    const unstakeFees = await options.getLogs({ target: stakingVault, eventAbi: "event WithdrawFeeCharged(address indexed owner, address indexed receiver, address indexed collector, uint256 feeAmount)" });
    for (const { feeAmount } of unstakeFees) {
      dailyFees.add(asset, toAsset(BigInt(feeAmount)), INSTANT_UNSTAKE_FEES);
      dailyRevenue.add(asset, toAsset(BigInt(feeAmount)), INSTANT_UNSTAKE_FEES);
    }
  }

  return { dailyFees, dailySupplySideRevenue, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-07-27", // first harvest streamed to stakers
  methodology: {
    Fees: "Yield earned by the USDC and WETH backing USDv and ETHv (deployed to Morpho, Pendle, Aave and StakeDAO strategies), measured as the growth in value of the sUSDv and sETHv staking shares, plus the performance fee (0% since launch) and the 0.1% fee paid by stakers who unstake instantly instead of waiting 7 days. Minting and redeeming USDv/ETHv is free.",
    SupplySideRevenue: "Yield streamed to sUSDv and sETHv stakers, measured as the growth in value of their staking shares.",
    Revenue: "Performance fee on strategy yield (0% since launch) and the 0.1% instant-unstake fee, both collected by the Vesper treasury. Excludes VSP distributions to esVSP lockers, which are tracked under Vesper.",
    ProtocolRevenue: "Performance fee on strategy yield (0% since launch) and the 0.1% instant-unstake fee, both collected by the Vesper treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Growth in value of sUSDv and sETHv shares: yield from the USDC and WETH backing USDv and ETHv, streamed to stakers over 7 days after each harvest.",
      [METRIC.PERFORMANCE_FEES]: "Performance fee taken on strategy profit before it reaches stakers (0% since launch).",
      [INSTANT_UNSTAKE_FEES]: "0.1% fee charged on sUSDv/sETHv unstakes that skip the 7-day cooldown.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Yield streamed to sUSDv and sETHv stakers, measured as the growth in value of their shares.",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fee on strategy profit, minted to the Vesper fee collector (0% since launch).",
      [INSTANT_UNSTAKE_FEES]: "0.1% instant-unstake fee sent to the Vesper treasury.",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fee on strategy profit, minted to the Vesper fee collector (0% since launch).",
      [INSTANT_UNSTAKE_FEES]: "0.1% instant-unstake fee sent to the Vesper treasury.",
    },
  },
};

export default adapter;
