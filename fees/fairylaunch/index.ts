import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// BSC Mainnet contracts
const FACTORY = '0x28163d7943AA6715a9559D468B29c0343412E236';
const FEE_MANAGER = '0xb6A7D47596D2202676822531F56EFeCeac309775';

// Bloque exacto de despliegue de LaunchFactory en BSC Mainnet
const FACTORY_DEPLOY_BLOCK = 116127983;

// Repartición de comisiones: 50% Protocolo, 50% Creador
const TREASURY_SHARE_PERCENT = 50n;

// Caché en memoria para evitar re-escanear todo el historial en cada hora del test
const knownCurves = new Set<string>();
let lastFetchedBlock = FACTORY_DEPLOY_BLOCK;

const methodology = {
  Volume: 'ethAmount from Buy events + gross ethAmount (ethAmount + fee) from Sell events across all BondingCurves',
  Fees: 'Total trading fees from Buy/Sell events + Graduation rewards',
  Revenue: 'Treasury fees + Treasury portion of graduation rewards',
  ProtocolRevenue: 'Treasury fees (50% of trading fees) + Treasury portion of graduation rewards',
  SupplySideRevenue: 'Creator fees (50% of trading fees) + Creator portion of graduation rewards',
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, fromBlock, toBlock } = options;

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  // Si se ejecuta fuera de orden o se reinicia la prueba, reseteamos el puntero
  if (fromBlock && fromBlock < lastFetchedBlock) {
    lastFetchedBlock = FACTORY_DEPLOY_BLOCK;
    knownCurves.clear();
  }

  // 1. Obtener de forma incremental solo los nuevos LaunchCreated desde la última lectura
  const launchLogs = await getLogs({
    target: FACTORY,
    eventAbi: 'event LaunchCreated(uint256 indexed launchId, address indexed creator, address indexed token, address bondingCurve, string name, string symbol, string metadataUri)',
    fromBlock: lastFetchedBlock,
    toBlock: toBlock,
  });

  for (const log of launchLogs) {
    if (log.bondingCurve && log.bondingCurve !== '0x0000000000000000000000000000000000000000') {
      knownCurves.add(log.bondingCurve.toLowerCase());
    }
  }

  // Actualizamos el puntero del bloque para la siguiente hora
  if (toBlock) {
    lastFetchedBlock = toBlock;
  }

  const uniqueCurves = Array.from(knownCurves);

  // 2. Procesar Compras y Ventas en el rango horario de options (fromBlock -> toBlock)
  if (uniqueCurves.length > 0) {
    const buyLogs = await getLogs({
      targets: uniqueCurves,
      eventAbi: 'event Buy(address indexed buyer, uint256 indexed launchId, uint256 ethAmount, uint256 tokenAmount, uint256 fee, uint256 priceAfter, uint256 ethReserveAfter, uint256 timestamp)',
    });

    const sellLogs = await getLogs({
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

  // 3. Procesar Recompensas de Graduación emitidas por FeeManager en la hora actual
  const rewardLogs = await getLogs({
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
  start: 1786752000,
  fetch,
  methodology,
  breakdownMethodology: methodology,
};

export default adapter;