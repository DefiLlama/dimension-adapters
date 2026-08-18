import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// BSC Mainnet contracts
// LaunchFactory: https://bscscan.com/address/0x28163d7943AA6715a9559D468B29c0343412E236#code
// FeeManager: https://bscscan.com/address/0xb6A7D47596D2202676822531F56EFeCeac309775#code
const FACTORY = '0x28163d7943AA6715a9559D468B29c0343412E236';
const FEE_MANAGER = '0xb6A7D47596D2202676822531F56EFeCeac309775';

// Fee split 50/50 según FeeManager._recordFee()
const TREASURY_SHARE_PERCENT = 50n;

const methodology = {
  Volume: 'ethAmount from Buy events + ethAmount from Sell events across all BondingCurves',
  Fees: 'Total trading fees from Buy/Sell events + Graduation rewards',
  Revenue: 'Treasury fees + Treasury portion of graduation rewards',
  ProtocolRevenue: 'Treasury fees (50% of trading fees) + Treasury portion of graduation rewards',
  SupplySideRevenue: 'Creator fees (50% of trading fees) + Creator portion of graduation rewards',
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Descubrir TODAS las BondingCurves desde LaunchCreated logs
  // getLogs con período amplio captura TODAS las curvas históricas
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

  // Fallback: BondingCurve conocida
  if (bondingCurves.length === 0) {
    bondingCurves.push('0x3014646079673048abaa2d84c9a197eefcde7b9b');
  }

  const uniqueCurves = [...new Set(bondingCurves)];

  // Eventos Buy de TODAS las BondingCurves
  const buyLogs = await getLogs({
    targets: uniqueCurves,
    eventAbi: 'event Buy(address indexed buyer, uint256 indexed launchId, uint256 ethAmount, uint256 tokenAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
  });

  // Eventos Sell de TODAS las BondingCurves
  const sellLogs = await getLogs({
    targets: uniqueCurves,
    eventAbi: 'event Sell(address indexed seller, uint256 indexed launchId, uint256 tokenAmount, uint256 ethAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
  });

  // Eventos GraduationRewardRecorded del FeeManager
  const rewardLogs = await getLogs({
    targets: [FEE_MANAGER],
    eventAbi: 'event GraduationRewardRecorded(address indexed creator, uint256 creatorReward, uint256 treasuryReward)',
  });

  for (const log of buyLogs) {
    const ethAmount = BigInt(log.ethAmount);
    const totalFee = BigInt(log.fee);

    dailyVolume.addGasToken(ethAmount);
    dailyFees.addGasToken(totalFee);
    
    const treasuryFee = totalFee * TREASURY_SHARE_PERCENT / 100n;
    const creatorFee = totalFee - treasuryFee;

    dailyProtocolRevenue.addGasToken(treasuryFee);
    dailySupplySideRevenue.addGasToken(creatorFee);
  }

  for (const log of sellLogs) {
    const ethAmount = BigInt(log.ethAmount);
    const totalFee = BigInt(log.fee);

    dailyVolume.addGasToken(ethAmount);
    dailyFees.addGasToken(totalFee);
    
    const treasuryFee = totalFee * TREASURY_SHARE_PERCENT / 100n;
    const creatorFee = totalFee - treasuryFee;

    dailyProtocolRevenue.addGasToken(treasuryFee);
    dailySupplySideRevenue.addGasToken(creatorFee);
  }

  for (const log of rewardLogs) {
    const creatorReward = BigInt(log.creatorReward);
    const treasuryReward = BigInt(log.treasuryReward);
    const totalReward = creatorReward + treasuryReward;

    dailyFees.addGasToken(totalReward);
    dailyProtocolRevenue.addGasToken(treasuryReward);
    dailySupplySideRevenue.addGasToken(creatorReward);
  }

  // CORRECCIÓN: dailyRevenue SOLO incluye protocol revenue (treasury)
  // NO incluye dailySupplySideRevenue (creator fees)
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  start: 1786752000,
  fetch,
  methodology,
  breakdownMethodology: methodology,
};

export default adapter;