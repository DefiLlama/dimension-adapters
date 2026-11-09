import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';

// Factory contract on BSC Mainnet: https://bscscan.com/address/0x28163d7943AA6715a9559D468B29c0343412E236
const FACTORY = '0x28163d7943AA6715a9559D468B29c0343412E236';

// FeeManager contract on BSC Mainnet: https://bscscan.com/address/0xb6A7D47596D2202676822531F56EFeCeac309775
const FEE_MANAGER = '0xb6A7D47596D2202676822531F56EFeCeac309775';

// Protocol fee split (50% treasury, 50% creator): https://bscscan.com/address/0xb6A7D47596D2202676822531F56EFeCeac309775#code
const TREASURY_SHARE_PERCENT = 50n;
const SHARE_DENOMINATOR = 100n;

// In-memory cache for discovered bonding curves and cursor tracking
const cachedCurves = new Set<string>();
let discoveredLaunchCount = 0;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 1. Descubrimiento incremental de curvas vía RPC multicall
  const totalLaunchesBN = await options.api.call({
    target: FACTORY,
    abi: 'function totalLaunches() view returns (uint256)',
  });

  const totalLaunches = Number(totalLaunchesBN || 0);

  if (totalLaunches > discoveredLaunchCount) {
    const newLaunchIds = Array.from(
      { length: totalLaunches - discoveredLaunchCount },
      (_, i) => discoveredLaunchCount + i + 1
    );

    const launches = await options.api.multiCall({
      target: FACTORY,
      abi: 'function getLaunch(uint256 launchId) view returns ((uint256 launchId, address creator, address treasury, address token, address bondingCurve, bool graduated, uint256 createdAt, uint256 graduatedAt, string name, string symbol, string metadataUri))',
      calls: newLaunchIds.map((id) => ({ params: [id] })),
    });

    for (const launch of launches) {
      if (launch?.bondingCurve && launch.bondingCurve !== ADDRESSES.null) {
        cachedCurves.add(launch.bondingCurve.toLowerCase());
      }
    }

    // Actualizar cursor solo tras éxito en el recorrido
    discoveredLaunchCount = totalLaunches;
  }

  const uniqueCurves = Array.from(cachedCurves);

  // 2. Procesar compras y ventas por lotes
  const [buyLogs, sellLogs] = await Promise.all([
    options.getLogs({
      targets: uniqueCurves,
      eventAbi:
        'event Buy(address indexed buyer, uint256 indexed launchId, uint256 ethAmount, uint256 tokenAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
      flatten: true,
    }),
    options.getLogs({
      targets: uniqueCurves,
      eventAbi:
        'event Sell(address indexed seller, uint256 indexed launchId, uint256 tokenAmount, uint256 ethAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
      flatten: true,
    }),
  ]);

  for (const log of buyLogs) {
    const ethAmount = BigInt(log.ethAmount || 0);
    const totalFee = BigInt(log.fee || 0);

    if (ethAmount > 0n) {
      dailyVolume.addGasToken(ethAmount);
    }

    if (totalFee > 0n) {
      dailyFees.addGasToken(totalFee, 'Trading Fees');

      const treasuryFee = (totalFee * TREASURY_SHARE_PERCENT) / SHARE_DENOMINATOR;
      const creatorFee = totalFee - treasuryFee;

      if (treasuryFee > 0n) {
        dailyProtocolRevenue.addGasToken(treasuryFee, 'Treasury Trading Fees');
      }

      if (creatorFee > 0n) {
        dailySupplySideRevenue.addGasToken(creatorFee, 'Creator Trading Fees');
      }
    }
  }

  for (const log of sellLogs) {
    const netEthAmount = BigInt(log.ethAmount || 0);
    const totalFee = BigInt(log.fee || 0);

    if (totalFee > 0n) {
      dailyFees.addGasToken(totalFee, 'Trading Fees');

      const treasuryFee = (totalFee * TREASURY_SHARE_PERCENT) / SHARE_DENOMINATOR;
      const creatorFee = totalFee - treasuryFee;

      if (treasuryFee > 0n) {
        dailyProtocolRevenue.addGasToken(treasuryFee, 'Treasury Trading Fees');
      }

      if (creatorFee > 0n) {
        dailySupplySideRevenue.addGasToken(creatorFee, 'Creator Trading Fees');
      }
    }

    const grossEthVolume = netEthAmount + totalFee;

    if (grossEthVolume > 0n) {
      dailyVolume.addGasToken(grossEthVolume);
    }
  }

  // 3. Recompensas de graduación desde FeeManager
  const graduationRewardLogs = await options.getLogs({
    target: FEE_MANAGER,
    eventAbi:
      'event GraduationRewardRecorded(address indexed creator, uint256 creatorReward, uint256 treasuryReward)',
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
  Volume:
    'BNB value from Buy events plus gross BNB value from Sell events across all Fairylaunch bonding curves.',
  Fees:
    'Total trading fees from buys and sells plus graduation rewards.',
  Revenue:
    'Treasury portion of trading fees plus treasury portion of graduation rewards.',
  ProtocolRevenue:
    'Treasury fees from trading and graduation rewards.',
  SupplySideRevenue:
    'Creator fees from trading and graduation rewards.',
};

const breakdownMethodology = {
  Fees: {
    'Trading Fees': '1% trading fee collected on buys and sells.',
    'Graduation Rewards': 'Rewards recorded when tokens graduate.',
  },
  Revenue: {
    'Treasury Trading Fees': 'Treasury portion of trading fees.',
    'Treasury Graduation Rewards': 'Treasury portion of graduation rewards.',
  },
  ProtocolRevenue: {
    'Treasury Trading Fees': 'Treasury portion of trading fees.',
    'Treasury Graduation Rewards': 'Treasury portion of graduation rewards.',
  },
  SupplySideRevenue: {
    'Creator Trading Fees': 'Creator portion of trading fees.',
    'Creator Graduation Rewards': 'Creator portion of graduation rewards.',
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  start: '2026-08-16',
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter; 
