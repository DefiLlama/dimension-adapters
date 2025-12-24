import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';

const config: {
  [chain: string]: {
    leverageManager: string;
    fromBlock: number;
  };
} = {
  [CHAIN.ETHEREUM]: {
    leverageManager: '0x5C37EB148D4a261ACD101e2B997A0F163Fb3E351',
    fromBlock: 23471226,
  },
  [CHAIN.BASE]: {
    leverageManager: '0x38Ba21C6Bf31dF1b1798FCEd07B4e9b07C5ec3a8',
    fromBlock: 31051780,
  },
};

const abis = {
  leverageTokenCreated:
    'event LeverageTokenCreated(address indexed token, address collateralAsset, address debtAsset, (address lendingAdapter, address rebalanceAdapter, uint256 mintTokenFee, uint256 redeemTokenFee) config)',
  mint: 'event Mint(address indexed sender, address indexed owner, uint256 assets, uint256 shares)',
  redeem:
    'event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
};

interface LeverageToken {
  token: string;
  collateralAsset: string;
  debtAsset: string;
  mintTokenFee: bigint;
  redeemTokenFee: bigint;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const leverageTokenLogs = await options.getLogs({
    target: config[options.chain].leverageManager,
    eventAbi: abis.leverageTokenCreated,
    fromBlock: config[options.chain].fromBlock,
    flatten: false,
  });

  const leverageTokens: LeverageToken[] = leverageTokenLogs.map((log: any) => ({
    token: log.token,
    collateralAsset: log.collateralAsset,
    debtAsset: log.debtAsset,
    mintTokenFee: BigInt(log.config.mintTokenFee),
    redeemTokenFee: BigInt(log.config.redeemTokenFee),
  }));

  if (!leverageTokens.length) {
    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
    };
  }

  for (const leverageToken of leverageTokens) {
    const mintLogs = await options.getLogs({
      target: leverageToken.token,
      eventAbi: abis.mint,
    });

    mintLogs.forEach((log: any) => {
      const assets = BigInt(log.assets);
      const feeAmount = (assets * leverageToken.mintTokenFee) / BigInt(1e18);

      if (feeAmount > 0n) {
        dailyFees.add(
          leverageToken.collateralAsset,
          feeAmount,
          METRIC.MINT_REDEEM_FEES
        );
        dailyRevenue.add(
          leverageToken.collateralAsset,
          feeAmount,
          METRIC.MINT_REDEEM_FEES
        );
        dailyProtocolRevenue.add(
          leverageToken.collateralAsset,
          feeAmount,
          METRIC.MINT_REDEEM_FEES
        );
      }
    });

    const redeemLogs = await options.getLogs({
      target: leverageToken.token,
      eventAbi: abis.redeem,
    });

    redeemLogs.forEach((log: any) => {
      const assets = BigInt(log.assets);
      const feeAmount = (assets * leverageToken.redeemTokenFee) / BigInt(1e18);

      if (feeAmount > 0n) {
        dailyFees.add(
          leverageToken.collateralAsset,
          feeAmount,
          METRIC.MINT_REDEEM_FEES
        );
        dailyRevenue.add(
          leverageToken.collateralAsset,
          feeAmount,
          METRIC.MINT_REDEEM_FEES
        );
        dailyProtocolRevenue.add(
          leverageToken.collateralAsset,
          feeAmount,
          METRIC.MINT_REDEEM_FEES
        );
      }
    });
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]:
      'Fees charged when users mint or redeem leverage tokens.',
  },
  Revenue: {
    [METRIC.MINT_REDEEM_FEES]:
      'Protocol revenue from mint and redeem operations.',
  },
  ProtocolRevenue: {
    [METRIC.MINT_REDEEM_FEES]:
      'Protocol revenue from mint and redeem operations.',
  },
};

const methodology = {
  Fees: 'Mint and redeem fees collected from leverage token operations. Fees are calculated as a percentage of the assets being minted or redeemed, as defined in each leverage token configuration.',
  Revenue: 'All mint and redeem fees are protocol revenue.',
  ProtocolRevenue: 'All mint and redeem fees are retained by the protocol.',
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-01-14',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2025-01-10',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
