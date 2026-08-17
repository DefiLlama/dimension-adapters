import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY = '0x28163d7943AA6715a9559D468B29c0343412E236';
const FEE_MANAGER = '0xb6A7D47596D2202676822531F56EFeCeac309775';

const TREASURY_FEE_BPS = 50n;
const BPS_DENOMINATOR = 10000n;

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const launchLogs = await getLogs({
    targets: [FACTORY],
    eventAbi: 'event LaunchCreated(uint256 indexed launchId, address indexed creator, address indexed token, address bondingCurve, string name, string symbol, string metadataUri)',
  });

  const bondingCurves: string[] = [];

  for (const log of launchLogs) {
    if (log.bondingCurve && log.bondingCurve !== '0x0000000000000000000000000000000000000000') {
      bondingCurves.push(log.bondingCurve.toLowerCase());
    }
  }

  if (bondingCurves.length === 0) {
    bondingCurves.push('0x3014646079673048abaa2d84c9a197eefcde7b9b');
  }

  const uniqueCurves = [...new Set(bondingCurves)];

  const buyLogs = await getLogs({
    targets: uniqueCurves,
    eventAbi: 'event Buy(address indexed buyer, uint256 indexed launchId, uint256 ethAmount, uint256 tokenAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
  });

  const sellLogs = await getLogs({
    targets: uniqueCurves,
    eventAbi: 'event Sell(address indexed seller, uint256 indexed launchId, uint256 tokenAmount, uint256 ethAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
  });

  const rewardLogs = await getLogs({
    targets: [FEE_MANAGER],
    eventAbi: 'event GraduationRewardRecorded(address indexed creator, uint256 creatorReward, uint256 treasuryReward)',
  });

  for (const log of buyLogs) {
    dailyVolume.addGasToken(BigInt(log.ethAmount));
    dailyFees.addGasToken(BigInt(log.fee));
    dailyProtocolRevenue.addGasToken(BigInt(log.fee) * TREASURY_FEE_BPS / BPS_DENOMINATOR);
  }

  for (const log of sellLogs) {
    dailyVolume.addGasToken(BigInt(log.ethAmount));
    dailyFees.addGasToken(BigInt(log.fee));
    dailyProtocolRevenue.addGasToken(BigInt(log.fee) * TREASURY_FEE_BPS / BPS_DENOMINATOR);
  }

  for (const log of rewardLogs) {
    dailyProtocolRevenue.addGasToken(BigInt(log.treasuryReward));
  }

  dailyRevenue.addBalances(dailyProtocolRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1786752000,
    },
  },
};

export default adapter;