import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

type ChainConfig = {
  factory: string;
  feeSplitter: string;
  feeSplitterStartBlock: number;
  feeAllocatorStartBlock: number;
  daoFeeCollector: string;
  crvusd: string;
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    factory: '0xC9332fdCB1C491Dcc683bAe86Fe3cb70360738BC',
    feeSplitter: '0x2dFd89449faff8a532790667bAb21cF733C064F2', // fee splitter sends crvusd revenue to scrvusd
    feeSplitterStartBlock: 20922363,
    feeAllocatorStartBlock: 22795776,  // Fee allocator voted in servce on June 27, 2025
                                       // send 10% to treasury
                                       // https://etherscan.io/tx/0xd38160744c06ae16d6edde5c444294e7e16db9a4d9f0631dc8599076c12685fd
    daoFeeCollector: '0xa2Bcd1a4Efbd04B63cd03f5aFf2561106EBCCe00',
    crvusd: '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E',
  },
};

const LABELS = {
  BorrowInterest: 'crvUSD Borrow Interest',
  ManagementFees: 'crvUSD Management Fees',
  StakingRewards: 'crvUSD Rewards To scrvUSD Stakers',
  TreasuryFees: 'crvUSD Fees To Treasury',
  veCRVHoldersRevenue: 'crvUSD Fees To veCRV Holders',
}

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, fromApi, toApi, chain, getFromBlock, getToBlock } = options;

  const chainConfig = config[chain];
  if (!chainConfig) throw new Error(`Chain ${chain} not supported`);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();

  // Get all controllers dynamically from factory
  const n_collaterals = await fromApi.call({
    target: chainConfig.factory,
    abi: "uint256:n_collaterals"
  });

  const controllers: string[] = [];
  for (let i = 0; i < Number(n_collaterals); i++) {
    const controller = await fromApi.call({
      target: chainConfig.factory,
      abi: "function controllers(uint256) view returns (address)",
      params: [i]
    });
    controllers.push(controller);
  }

  // check if we're before or after FeeSplitter deployment
  // https://etherscan.io/tx/0x19d099a74fd61daa11073aa182bc61b2e8dcaebe3f8db81fbdc0ebf2613a0735
  const useFeeSplitter = toBlock >= chainConfig.feeSplitterStartBlock;

  if (useFeeSplitter) {
    // after Oct-08-2024:track transfers from FeeSplitter contract
    const feeSplitterPadded = '0x' + chainConfig.feeSplitter.slice(2).toLowerCase().padStart(64, '0');

    const transferLogs = await getLogs({
      target: chainConfig.crvusd,
      eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
      topics: [
        '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        feeSplitterPadded, // from = FeeSplitter
      ],
      fromBlock,
      toBlock,
    });


    for (const log of transferLogs) {
      if (log.from.toLowerCase() === chainConfig.feeSplitter.toLowerCase()) {
        dailyFees.add(chainConfig.crvusd, log.value, LABELS.BorrowInterest);

        // Only DAO collector portion is token holder revenue
        if (log.to.toLowerCase() === chainConfig.daoFeeCollector.toLowerCase()) {
          dailyRevenue.add(chainConfig.crvusd, log.value, LABELS.BorrowInterest);

          // After June 2025: 10% goes to treasury, 90% to veCRV holders
          if (toBlock >= chainConfig.feeAllocatorStartBlock) {
            dailyProtocolRevenue.add(chainConfig.crvusd, BigInt(log.value) * 1n / 10n, LABELS.TreasuryFees);
            dailyHoldersRevenue.add(chainConfig.crvusd, BigInt(log.value) * 9n / 10n, LABELS.veCRVHoldersRevenue);
          } else {
            dailyHoldersRevenue.add(chainConfig.crvusd, log.value, LABELS.veCRVHoldersRevenue);
          }

        }
      }
    }
  } else {
    // Before Oct-08-2024: feetch fee collect events
    await Promise.all(controllers.map(async controller => {
      const logs = await getLogs({
        target: controller,
        eventAbi: 'event CollectFees(uint256 amount, uint256 new_supply)',
        fromBlock,
        toBlock,
      });
      logs.forEach((log: any) => {
        dailyFees.add(chainConfig.crvusd, log.amount, LABELS.BorrowInterest);
        dailyRevenue.add(chainConfig.crvusd, log.amount, LABELS.BorrowInterest);
      });

      const feesStart = await fromApi.call({ target: controller, abi: "uint256:admin_fees" });
      const feesEnd = await toApi.call({ target: controller, abi: "uint256:admin_fees" });
      if (BigInt(feesEnd) > BigInt(feesStart)) {
        dailyFees.add(chainConfig.crvusd, feesEnd - feesStart, LABELS.ManagementFees);
        dailyRevenue.add(chainConfig.crvusd, feesEnd - feesStart, LABELS.ManagementFees);
        
        // Before FeeSplitter, all fees went to token holders
        dailyHoldersRevenue.add(chainConfig.crvusd, feesEnd - feesStart, LABELS.veCRVHoldersRevenue);
      }
    }));
  }
  
  const tempBalance = dailyFees.clone();
  tempBalance.subtract(dailyRevenue);

  const dailySupplySideRevenue = createBalances();
  dailySupplySideRevenue.addBalances(tempBalance, LABELS.StakingRewards);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-05-14',
  methodology: {
    Fees: 'All borrow interest paid by borrowers.',
    Revenue: 'All borrow interest go to protocol treasury + veCRV holders.',
    ProtocolRevenue: 'Revenue share to protocol treasury.',
    HoldersRevenue: 'Revenue share to veCRV holders.',
    SupplySideRevenue: 'Revenue share to scrvUSD stakers.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.BorrowInterest]: 'Borrow interest fees collected and distributed through the FeeSplitter contract (post Oct 2024) and from controller contracts via CollectFees events (pre FeeSplitter).',
      [LABELS.ManagementFees]: 'Uncollected admin fees accrued in controller contracts between start and end of the period.',
    },
    Revenue: {
      [LABELS.BorrowInterest]: 'Borrow interest fees collected and distributed through the FeeSplitter contract (post Oct 2024) and from controller contracts via CollectFees events (pre FeeSplitter).',
      [LABELS.ManagementFees]: 'Uncollected admin fees accrued in controller contracts between start and end of the period.',
    },
    SupplySideRevenue: {
      [LABELS.StakingRewards]: 'Revenue share to scrvUSD stakers.',
    },
    HoldersRevenue: {
      [LABELS.veCRVHoldersRevenue]: 'Revenue share to veCRV holders.',
    },
  }
};

export default adapter;
