import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// BSC Mainnet Contracts
const FACTORY = '0x28163d7943AA6715a9559D468B29c0343412E236';
const FEE_MANAGER = '0xb6A7D47596D2202676822531F56EFeCeac309775';

// Repartición de comisiones: 50% Protocolo (Treasury), 50% Creador del token
const TREASURY_SHARE_PERCENT = 50n;

// Registro persistente en memoria para almacenar las bonding curves descubiertas
const cachedCurves = new Set<string>();

const methodology = {
  Volume: 'ethAmount from Buy events + gross ethAmount (ethAmount + fee) from Sell events across all BondingCurves',
  Fees: 'Total trading fees (1% per trade) + Graduation rewards',
  Revenue: 'Treasury portion of trading fees (0.5%) + Treasury portion of graduation rewards',
  ProtocolRevenue: 'Treasury fees (50% of trading fees) + Treasury portion of graduation rewards',
  SupplySideRevenue: 'Creator fees (50% of trading fees) + Creator portion of graduation rewards',
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // 1. Descubrimiento directo de curvas vía RPC multicall (evita bloqueos/timeouts)
  if (cachedCurves.size === 0) {
    try {
      const totalLaunches = await options.api.call({
        target: FACTORY,
        abi: 'function totalLaunches() view returns (uint256)',
      });

      const count = Number(totalLaunches);
      if (count > 0) {
        const launchIds = Array.from({ length: count }, (_, i) => i + 1);
        const launches = await options.api.multiCall({
          target: FACTORY,
          abi: 'function getLaunch(uint256 launchId) view returns ((uint256 launchId, address creator, address treasury, address token, address bondingCurve, bool graduated, uint256 createdAt, uint256 graduatedAt, string name, string symbol, string metadataUri))',
          calls: launchIds.map((id) => ({ params: [id] })),
        });

        for (const launch of launches) {
          if (launch?.bondingCurve && launch.bondingCurve !== '0x0000000000000000000000000000000000000000') {
            cachedCurves.add(launch.bondingCurve.toLowerCase());
          }
        }
      }
    } catch {
      // Fallback a getLogs si la consulta directa falla
      const launchLogs = await options.getLogs({
        target: FACTORY,
        eventAbi: 'event LaunchCreated(uint256 indexed launchId, address indexed creator, address indexed token, address bondingCurve, string name, string symbol, string metadataUri)',
      });
      for (const log of launchLogs) {
        if (log.bondingCurve && log.bondingCurve !== '0x0000000000000000000000000000000000000000') {
          cachedCurves.add(log.bondingCurve.toLowerCase());
        }
      }
    }
  }

  const uniqueCurves = Array.from(cachedCurves);

  // 2. Procesamiento de compras y ventas en las curvas registradas
  if (uniqueCurves.length > 0) {
    const buyLogs = await options.getLogs({
      targets: uniqueCurves,
      eventAbi: 'event Buy(address indexed buyer, uint256 indexed launchId, uint256 ethAmount, uint256 tokenAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
    });

    const sellLogs = await options.getLogs({
      targets: uniqueCurves,
      eventAbi: 'event Sell(address indexed seller, uint256 indexed launchId, uint256 tokenAmount, uint256 ethAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
    });

    for (const log of buyLogs) {
      const ethAmount = BigInt(log.ethAmount);
      const totalFee = BigInt(log.fee);

      dailyVolume.addGasToken(ethAmount);
      dailyFees.addGasToken(totalFee);

      const treasuryFee = (totalFee * TREASURY_SHARE_PERCENT) / 100n;
      const creatorFee = totalFee - treasuryFee;

      dailyProtocolRevenue.addGasToken(treasuryFee);
      dailySupplySideRevenue.addGasToken(creatorFee);
    }

    for (const log of sellLogs) {
      const netEthAmount = BigInt(log.ethAmount);
      const totalFee = BigInt(log.fee);
      const grossEthVolume = netEthAmount + totalFee;

      dailyVolume.addGasToken(grossEthVolume);
      dailyFees.addGasToken(totalFee);

      const treasuryFee = (totalFee * TREASURY_SHARE_PERCENT) / 100n;
      const creatorFee = totalFee - treasuryFee;

      dailyProtocolRevenue.addGasToken(treasuryFee);
      dailySupplySideRevenue.addGasToken(creatorFee);
    }
  }

  // 3. Recompensas de graduación en FeeManager
  const rewardLogs = await options.getLogs({
    target: FEE_MANAGER,
    eventAbi: 'event GraduationRewardRecorded(address indexed creator, uint256 creatorReward, uint256 treasuryReward)',
  });

  for (const log of rewardLogs) {
    const creatorReward = BigInt(log.creatorReward);
    const treasuryReward = BigInt(log.treasuryReward);
    const totalReward = creatorReward + treasuryReward;

    dailyFees.addGasToken(totalReward);
    dailyProtocolRevenue.addGasToken(treasuryReward);
    dailySupplySideRevenue.addGasToken(creatorReward);
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

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  start: 1786665600, // 16 de Agosto de 2026 00:00:00 UTC
  fetch,
  methodology,
  breakdownMethodology: methodology,
};

export default adapter;