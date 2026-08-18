import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// FeeManager contract on BSC Mainnet
// Source: https://bscscan.com/address/0xb6A7D47596D2202676822531F56EFeCeac309775
const FEE_MANAGER = '0xb6A7D47596D2202676822531F56EFeCeac309775';

// BondingCurveFactory contract on BSC Mainnet
// This contract emits CurveCreated events with curve address as indexed topic
// Source: https://bscscan.com/address/0x12959266beada47f0dce13a3a0e54ecfe4fddb29
const BONDING_CURVE_FACTORY = '0x12959266beada47f0dce13a3a0e54ecfe4fddb29';

// Factory deployment block on BSC Mainnet
// Source: Transaction 0x83c59454a1ab8d8e522d6a6af749cbe0cf63208239f1e51622370ebcfea5d7be
const FACTORY_DEPLOYMENT_BLOCK = 116127972;

// Cache for bonding curve addresses
let cachedCurves: Set<string> | null = null;
let lastScannedBlock = FACTORY_DEPLOYMENT_BLOCK;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const currentBlock = await options.getToBlock();

  // Initialize cache
  if (!cachedCurves) {
    cachedCurves = new Set<string>();
  }

  // Discover curves from CurveCreated events
  // Only scan if we haven't scanned recently (avoid rate limits)
  if (cachedCurves.size === 0 || currentBlock > lastScannedBlock + 100) {
    const curveCreatedLogs = await options.getLogs({
      target: BONDING_CURVE_FACTORY,
      eventAbi: 'event CurveCreated(address indexed curve, uint256 indexed launchId)',
      fromBlock: lastScannedBlock,
      toBlock: currentBlock,
    });

    for (const log of curveCreatedLogs) {
      if (
        log.curve &&
        log.curve !== '0x0000000000000000000000000000000000000000' &&
        /^0x[0-9a-fA-F]{40}$/.test(log.curve)
      ) {
        cachedCurves.add(log.curve.toLowerCase());
      }
    }

    lastScannedBlock = currentBlock;
  }

  const uniqueCurves = Array.from(cachedCurves);

  if (uniqueCurves.length === 0) {
    return {
      dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    };
  }

  // Get Buy and Sell events from the bonding curves themselves
  // Use targets array with discovered curves
  const [buyLogs, sellLogs] = await Promise.all([
    options.getLogs({
      targets: uniqueCurves,
      eventAbi: 'event Buy(address indexed buyer, uint256 indexed launchId, uint256 ethAmount, uint256 tokenAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
    }),
    options.getLogs({
      targets: uniqueCurves,
      eventAbi: 'event Sell(address indexed seller, uint256 indexed launchId, uint256 tokenAmount, uint256 ethAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
    }),
  ]);

  // Process Buy events
  for (const log of buyLogs) {
    const ethAmount = BigInt(log.ethAmount || 0);
    const totalFee = BigInt(log.fee || 0);

    if (ethAmount > 0n) {
      dailyVolume.addGasToken(ethAmount, 'Buy Volume');
    }

    if (totalFee > 0n) {
      dailyFees.addGasToken(totalFee, 'Trading Fees');
      
      // Fee split is 50/50 per FeeManager._recordFee()
      // Source: https://bscscan.com/address/0xb6A7D47596D2202676822531F56EFeCeac309775#code
      const creatorShare = totalFee / 2n;
      const treasuryShare = totalFee - creatorShare;
      
      if (treasuryShare > 0n) {
        dailyProtocolRevenue.addGasToken(treasuryShare, 'Treasury Trading Fees');
      }
      if (creatorShare > 0n) {
        dailySupplySideRevenue.addGasToken(creatorShare, 'Creator Trading Fees');
      }
    }
  }

  // Process Sell events
  for (const log of sellLogs) {
    const netEthAmount = BigInt(log.ethAmount || 0);
    const totalFee = BigInt(log.fee || 0);

    if (totalFee > 0n) {
      dailyFees.addGasToken(totalFee, 'Trading Fees');
      
      const creatorShare = totalFee / 2n;
      const treasuryShare = totalFee - creatorShare;
      
      if (treasuryShare > 0n) {
        dailyProtocolRevenue.addGasToken(treasuryShare, 'Treasury Trading Fees');
      }
      if (creatorShare > 0n) {
        dailySupplySideRevenue.addGasToken(creatorShare, 'Creator Trading Fees');
      }
    }

    // Volume = net ETH received + fee (gross volume)
    const grossEthVolume = netEthAmount + totalFee;
    
    if (grossEthVolume > 0n) {
      dailyVolume.addGasToken(grossEthVolume, 'Sell Volume');
    }
  }

  // Process graduation rewards from FeeManager
  const graduationRewardLogs = await options.getLogs({
    target: FEE_MANAGER,
    eventAbi: 'event GraduationRewardRecorded(address indexed creator, uint256 creatorReward, uint256 treasuryReward)',
  });

  for (const log of graduationRewardLogs) {
    const creatorReward = BigInt(log.creatorReward || 0);
    const treasuryReward = BigInt(log.treasuryReward || 0);
    const totalReward = creatorReward + treasuryReward;

    if (totalReward > 0n) {
      dailyFees.addGasToken(totalReward, 'Graduation Rewards');
    }
    if (treasuryReward > 0n) {
      dailyProtocolRevenue.addGasToken(treasuryReward, 'Treasury Graduation Rewards');
    }
    if (creatorReward > 0n) {
      dailySupplySideRevenue.addGasToken(creatorReward, 'Creator Graduation Rewards');
    }
  }

  // Revenue = Protocol Revenue (treasury portion only)
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: 'BNB value from Buy events plus gross BNB value from Sell events across all Fairylaunch bonding curves.',
  Fees: 'Total trading fees from buys and sells plus graduation rewards.',
  Revenue: 'Treasury portion of trading fees plus treasury portion of graduation rewards.',
  ProtocolRevenue: 'Treasury fees from trading and graduation rewards.',
  SupplySideRevenue: 'Creator fees from trading and graduation rewards.',
};

const breakdownMethodology = {
  Volume: {
    'Buy Volume': 'BNB value from Buy events.',
    'Sell Volume': 'Gross BNB value from Sell events (net ETH + fee).',
  },
  Fees: {
    'Trading Fees': 'Trading fee collected on buys and sells.',
    'Graduation Rewards': 'Rewards recorded when tokens graduate to liquidity pools.',
  },
  Revenue: {
    'Treasury Trading Fees': 'Treasury portion of trading fees (50%).',
    'Treasury Graduation Rewards': 'Treasury portion of graduation rewards.',
  },
  ProtocolRevenue: {
    'Treasury Trading Fees': 'Treasury portion of trading fees (50%).',
    'Treasury Graduation Rewards': 'Treasury portion of graduation rewards.',
  },
  SupplySideRevenue: {
    'Creator Trading Fees': 'Creator portion of trading fees (50%).',
    'Creator Graduation Rewards': 'Creator portion of graduation rewards.',
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  // Deployment block 116127972 - not a timestamp
  // Source: https://bscscan.com/tx/0x83c59454a1ab8d8e522d6a6af749cbe0cf63208239f1e51622370ebcfea5d7be
  start: 116127972,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;