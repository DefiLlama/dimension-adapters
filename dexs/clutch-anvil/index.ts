import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Clutch Anvil AMM — permissionless NFT AMM. Each market deploys an
// `NFTAMMVault` that swaps an ERC20 token (paired 1:N to a specific NFT
// collection) against NFT inventory. Buys/sells emit:
//
//   event NFTSold(
//     address indexed seller, uint256 indexed tokenId,
//     uint256 grossPayout, uint256 netPayout,
//     uint256 protocolFee, uint256 stakerFee
//   )
//   event NFTBought(
//     address indexed buyer, uint256 indexed tokenId,
//     uint256 totalCost, uint256 baseCost,
//     uint256 protocolFee, uint256 stakerFee, bool isSpecific
//   )
//
// Volume = sum of `totalCost` (buys) + `grossPayout` (sells), denominated
// in each market's own ERC20 token. DefiLlama prices the tokens into USD.
//
// Fees = sum of `protocolFee + stakerFee` from both events. Protocol fee is
// burned (deflationary on the token), staker fee streams to the staking
// vault as rewards. We expose the full fee tranche as protocol revenue.
//
// Robinhood Chain (v2/v3 generation, live 2026-08-05) additionally charges:
//
//   event RobinhoodSwapFeePaid(
//     address indexed payer, uint256 feeWei, address treasury, address booster
//   )
//   event LoanEthFeePaid(uint256 indexed loanId, address indexed payer, uint256 amount)
//   event ActivationEthFeePaid(uint256 indexed tokenId, address indexed payer, uint256 amount)
//
// Flat oracle-priced ETH fees (~$2 swap / ~$2 loan create / ~$1 soft-staking
// activate). Swap fee splits 50% treasury / 50% StockBooster; loan +
// activation ETH fees go 100% to the treasury.

const chainsConfig: Record<string, { factory: string; fromBlock: number; start: string }> = {
  [CHAIN.ETHEREUM]: {
    factory: "0xEA095646EC6A56EDbFEe84cCcf23eFCec12566A0",
    fromBlock: 24720104,
    start: "2026-03-23",
  },
  [CHAIN.BASE]: {
    factory: "0x5ef900789a0faa1fDE3e9796441B62b66f0ab2Aa",
    fromBlock: 45593260,
    start: "2026-04-01",
  },
  [CHAIN.APECHAIN]: {
    factory: "0x87B62309B6fF4FA184C89919351bEbd3AC11Fc84",
    fromBlock: 34900822,
    start: "2026-02-15",
  },
  [CHAIN.ROBINHOOD]: {
    factory: "0x432D20AAe5605b1E94C914283d7155eBc6727351",
    fromBlock: 28775550,
    start: "2026-08-05",
  },
};

const MARKET_CREATED_ABI =
  "event MarketCreated(uint256 indexed marketId, address indexed collection, address indexed token, address escrow, address ammVault, address loanVault, address stakingVault, address governor, bool governanceEnabled)";

const NFT_BOUGHT_ABI =
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 totalCost, uint256 baseCost, uint256 protocolFee, uint256 stakerFee, bool isSpecific)";

const NFT_SOLD_ABI =
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 grossPayout, uint256 netPayout, uint256 protocolFee, uint256 stakerFee)";

const ROBINHOOD_SWAP_FEE_ABI =
  "event RobinhoodSwapFeePaid(address indexed payer, uint256 feeWei, address treasury, address booster)";

const LOAN_ETH_FEE_ABI =
  "event LoanEthFeePaid(uint256 indexed loanId, address indexed payer, uint256 amount)";

const ACTIVATION_ETH_FEE_ABI =
  "event ActivationEthFeePaid(uint256 indexed tokenId, address indexed payer, uint256 amount)";

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { chain, createBalances, getLogs } = options;
  const { factory, fromBlock } = chainsConfig[chain];

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();  

  const markets = await getLogs({
    target: factory,
    fromBlock,
    eventAbi: MARKET_CREATED_ABI, 
    cacheInCloud: true,
  });

  const ammByToken = new Map<string, string>();
  const loanVaults: string[] = [];
  const stakingVaults: string[] = [];
  markets.forEach((m: any) => {
    if (!m?.ammVault || !m?.token) return;
    ammByToken.set(m.ammVault.toLowerCase(), m.token.toLowerCase());
    if (m.loanVault) loanVaults.push(String(m.loanVault).toLowerCase());
    if (m.stakingVault) stakingVaults.push(String(m.stakingVault).toLowerCase());
  });

  const ammVaults = Array.from(ammByToken.keys());
  if (ammVaults.length === 0) {
    return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
  }

  const [buyLogs, sellLogs] = await Promise.all([
    getLogs({
      targets: ammVaults,
      eventAbi: NFT_BOUGHT_ABI,
      flatten: true,
      entireLog: true,
      parseLog: true,
    }),
    getLogs({
      targets: ammVaults,
      eventAbi: NFT_SOLD_ABI,
      flatten: true,
      entireLog: true,
      parseLog: true,
    }),
  ]);

  for (const log of buyLogs) {
    const args = log.args;
    const vault = log.address.toLowerCase();
    const token = ammByToken.get(vault);
    if (!token) continue;
    dailyVolume.add(token, args.totalCost);
    dailyFees.add(token, (args.protocolFee + args.stakerFee), METRIC.TRADING_FEES);
    dailySupplySideRevenue.add(token, args.protocolFee, 'Fees to NFT burn');
    dailySupplySideRevenue.add(token, args.stakerFee, 'Fees to NFT stakers');
  }

  for (const log of sellLogs) {
    const args = log.args;
    const vault = log.address.toLowerCase();
    const token = ammByToken.get(vault);
    if (!token) continue;
    dailyVolume.add(token, args.grossPayout);
    dailyFees.add(token, (args.protocolFee + args.stakerFee), METRIC.TRADING_FEES);
    dailySupplySideRevenue.add(token, args.protocolFee, 'Fees to NFT burn');
    dailySupplySideRevenue.add(token, args.stakerFee, 'Fees to NFT stakers');
  }

  // Robinhood markets also pay flat oracle-priced ETH fees on swaps, loans,
  // and soft-staking activations.
  if (chain === CHAIN.ROBINHOOD) {
    const ethFeeLogs = await getLogs({
      targets: ammVaults,
      eventAbi: ROBINHOOD_SWAP_FEE_ABI,
      flatten: true,
    });

    const protocolShare = 0.5;

    for (const log of ethFeeLogs) {
      dailyFees.addGasToken(log.feeWei, METRIC.TRADING_FEES);
      dailyRevenue.addGasToken(Number(log.feeWei) * protocolShare, 'Robinhood ETH swap fee to protocol');
      dailySupplySideRevenue.addGasToken(Number(log.feeWei) * (1 - protocolShare), 'Robinhood ETH swap fee to StockBooster rewards engine');
    }

    const uniqueLoans = [...new Set(loanVaults)];
    const uniqueStaking = [...new Set(stakingVaults)];

    if (uniqueLoans.length > 0) {
      const loanFeeLogs = await getLogs({
        targets: uniqueLoans,
        eventAbi: LOAN_ETH_FEE_ABI,
        flatten: true,
      });
      for (const log of loanFeeLogs) {
        const amount = BigInt(log.amount);
        if (amount <= 0n) continue;
        dailyFees.addGasToken(amount, 'Robinhood ETH loan-creation fee');
        dailyRevenue.addGasToken(amount, 'Robinhood ETH loan-creation fee');
      }
    }

    if (uniqueStaking.length > 0) {
      const actFeeLogs = await getLogs({
        targets: uniqueStaking,
        eventAbi: ACTIVATION_ETH_FEE_ABI,
        flatten: true,
      });
      for (const log of actFeeLogs) {
        const amount = BigInt(log.amount);
        if (amount <= 0n) continue;
        dailyFees.addGasToken(amount, 'Robinhood ETH soft-staking activation fee');
        dailyRevenue.addGasToken(amount, 'Robinhood ETH soft-staking activation fee');
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Sum of buy totalCost and sell grossPayout from NFTBought + NFTSold events across every AMM vault deployed by the Clutch Anvil factory.",
  Fees: "Sum of protocolFee + stakerFee fields from NFTBought + NFTSold events. Protocol fee is burned; staker fee streams to the NFT staking vault as rewards. On Robinhood Chain every swap additionally pays a flat oracle-priced ~$2 ETH fee (RobinhoodSwapFeePaid), every loan create pays ~$2 ETH (LoanEthFeePaid), and every soft-staking activate/upgrade pays ~$1 ETH (ActivationEthFeePaid).",
  Revenue: "Robinhood Chain only: 50% of the flat ETH swap fee to the protocol treasury, plus 100% of loan-creation and soft-staking activation ETH fees to the treasury.",
  ProtocolRevenue: "Robinhood Chain only: 50% of the flat ETH swap fee to the protocol treasury, plus 100% of loan-creation and soft-staking activation ETH fees to the treasury.",
  SupplySideRevenue: "Includes NFTs burned from protocol revenue and staker fees distributed to the NFT stakers plus 50% of the flat oracle-priced ~$2 ETH fee per Robinhood Chain swap that goes to the StonkBrokers StockBooster rewards engine.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Sum of protocolFee + stakerFee fields from NFTBought + NFTSold events (protocol fee burned, staker fee to the NFT staking vault), plus the flat ~$2 ETH fee per swap on Robinhood Chain.",
    'Robinhood ETH loan-creation fee': "Flat oracle-priced ~$2 ETH fee on every Anvil loan create (LoanEthFeePaid), 100% to the treasury.",
    'Robinhood ETH soft-staking activation fee': "Flat oracle-priced ~$1 ETH fee on every soft-staking activate/upgrade (ActivationEthFeePaid), 100% to the treasury.",
  },
  Revenue: {
    'Robinhood ETH swap fee to protocol': "50% of the flat oracle-priced ~$2 ETH fee per Robinhood Chain swap goes to the protocol treasury.",
    'Robinhood ETH loan-creation fee': "100% of LoanEthFeePaid → treasury.",
    'Robinhood ETH soft-staking activation fee': "100% of ActivationEthFeePaid → treasury.",
  },
  ProtocolRevenue: {
    'Robinhood ETH swap fee to protocol': "50% of the flat oracle-priced ~$2 ETH fee per Robinhood Chain swap goes to the protocol treasury.",
    'Robinhood ETH loan-creation fee': "100% of LoanEthFeePaid → treasury.",
    'Robinhood ETH soft-staking activation fee': "100% of ActivationEthFeePaid → treasury.",
  },
  SupplySideRevenue: {
    'Fees to NFT burn': "Sum of protocolFee fields from NFTBought + NFTSold events. Protocol fee is burned directly rewarding NFT holders (supply side)",
    'Fees to NFT stakers': "Sum of stakerFee fields from NFTBought + NFTSold events. Staker fee streams to the NFT staking vault as rewards.",
    'Robinhood ETH swap fee to StockBooster rewards engine': "50% of the flat oracle-priced ~$2 ETH fee per Robinhood Chain swap goes to the StonkBrokers StockBooster rewards engine.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainsConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
