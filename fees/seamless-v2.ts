import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const chainConfig: {
  [chain: string]: {
    leverageManager: string;
    fromBlock: number;
    pricingAdapter: string,
    start: string,
  };
} = {
  [CHAIN.ETHEREUM]: {
    leverageManager: '0x5C37EB148D4a261ACD101e2B997A0F163Fb3E351',
    fromBlock: 23471226,
    pricingAdapter: '0x44CCEBEA0dAc17105e91a59E182f65f8D176c88f',
    start: '2025-01-14',
  },
  [CHAIN.BASE]: {
    leverageManager: '0x38Ba21C6Bf31dF1b1798FCEd07B4e9b07C5ec3a8',
    fromBlock: 31051780,
    pricingAdapter: '0xce05FbEd9260810Bdded179ADfdaf737BE7ded71',
    start: '2025-01-10',
  },
};

const abis = {
  leverageTokenCreated:
    'event LeverageTokenCreated(address indexed token, address collateralAsset, address debtAsset, (address lendingAdapter, address rebalanceAdapter, uint256 mintTokenFee, uint256 redeemTokenFee) config)',
  mint: 'event Mint(address indexed token, address indexed sender, tuple(uint256 collateral,uint256 debt,uint256 shares, uint256 tokenFee, uint256 treasuryFee) actionData)',
  redeem:
    'event Redeem(address indexed token, address indexed sender, tuple(uint256 collateral,uint256 debt,uint256 shares, uint256 tokenFee, uint256 treasuryFee) actionData)',
  managementFeeCharged: 'event ManagementFeeCharged(address leverageToken, uint256 sharesFee)',
  price: 'function getLeverageTokenPriceInCollateral(address leverageToken) view returns(uint256)',
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const balanceMap = new Map<string, Map<string, number>>();
  const { leverageManager, pricingAdapter, fromBlock } = chainConfig[options.chain];

  const leverageTokenLogs = await options.getLogs({
    target: leverageManager,
    eventAbi: abis.leverageTokenCreated,
    fromBlock: fromBlock,
    cacheInCloud: true,
  });

  const leverageTokenMap = new Map(leverageTokenLogs.map((log: any) => [log.token, log.collateralAsset]));

  const prices = await options.api.multiCall({
    calls: leverageTokenLogs.map((log: any) => ({ target: pricingAdapter, params: log.token })),
    abi: abis.price,
  });

  const mintLogs = await options.getLogs({
    target: leverageManager,
    eventAbi: abis.mint,
  });

  const redeemLogs = await options.getLogs({
    target: leverageManager,
    eventAbi: abis.redeem
  });

  const managementFeeChargedLogs = await options.getLogs({
    target: leverageManager,
    eventAbi: abis.managementFeeCharged,
  });

  const updateFeeBalance = (token: string, feeType: 'mint_redeem' | 'management', feeAmount: number) => {
    let categoryMap = balanceMap.get(token);
    if (!categoryMap) categoryMap = new Map<string, number>();
    const accruedFee = categoryMap?.get(feeType) || 0;
    categoryMap.set(feeType, accruedFee + feeAmount);
    balanceMap.set(token, categoryMap);
  }

  redeemLogs.forEach(log => {
    updateFeeBalance(log.token, 'mint_redeem', Number(log.actionData.tokenFee));
  });

  mintLogs.forEach(log => {
    updateFeeBalance(log.token, 'mint_redeem', Number(log.actionData.tokenFee));
  });

  managementFeeChargedLogs.forEach(log => {
    updateFeeBalance(log.leverageToken, 'management', Number(log.sharesFee));
  });

  let index = 0;

  for (const [leverageToken, collateral] of leverageTokenMap.entries()) {
    const tokenPriceInCollateral = prices[index];
    const tokenBalanceMap = balanceMap.get(leverageToken);
    if (!tokenBalanceMap) continue;

    const mintRedeemFeeInCollateral = (tokenPriceInCollateral / 1e18) * (tokenBalanceMap.get('mint_redeem') ?? 0);
    const managementFeeInCollateral = (tokenPriceInCollateral / 1e18) * (tokenBalanceMap.get('management') ?? 0);

    dailyFees.add(collateral, mintRedeemFeeInCollateral, METRIC.MINT_REDEEM_FEES);
    dailyFees.add(collateral, managementFeeInCollateral, METRIC.MANAGEMENT_FEES);
    index++;
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]:
      'Fees charged when users mint or redeem leverage tokens.',
    [METRIC.MANAGEMENT_FEES]: 'Managment fees charged by seamless'
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]:
      'Protocol revenue from mint and redeem operations.',
    [METRIC.MANAGEMENT_FEES]: 'All managment fees are revenue',
  },
  ProtocolRevenue: {
    [METRIC.MINT_REDEEM_FEES]:
      'Protocol revenue from mint and redeem operations.',
    [METRIC.MANAGEMENT_FEES]: 'All management fees goes to protocol',
  },
};

const methodology = {
  Fees: 'Management fees and Mint and redeem fees collected from leverage token operations. Fees are calculated as a percentage of the assets being minted or redeemed, as defined in each leverage token configuration.',
  Revenue: 'All mint and redeem fees, management fees are protocol revenue.',
  ProtocolRevenue: 'All mint and redeem fees, management fees are retained by the protocol.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
