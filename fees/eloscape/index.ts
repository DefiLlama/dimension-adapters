import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Eloscape mining grid and its Treasury on Elysium, round 1 settled in tx 0x2caef5fc10adf6a1491b4161232f8959df68926b79919c2bafa0dfe4399e496e
const grid = "0xFa5856b6f352C0E7863D7F5502564130215bf80F";
const treasury = "0xDB7CEA5D88492330BBd9FD3E9c7cd91A3604BB95";
const roundSettledEvent = "event RoundSettled(uint64 indexed roundId,uint8 winningBlock,address topMiner,uint256 totalWinnings,uint256 topMinerReward,uint256 motherlodeAmount,bool isSplit,uint256 topMinerSeed,uint256 winnersDeployed,uint256 rot,uint256 manualOnWinning,uint256 topMinerTarget,uint256 totalDeployed,uint256 vaultAmount)";
// Treasury allocation version: burn, staking, reserve, referral and gas rates in bps, recipients, then running totals
const epochAbi = "function epoch(uint256) view returns (((uint16,uint16,uint16,uint16,uint16,address,address,address,address,address),uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))";
const BPS = 10000n;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const rounds = await options.getLogs({ target: grid, eventAbi: roundSettledEvent });
  let adminFees = 0n, treasuryShare = 0n;
  for (const round of rounds) {
    const vaultAmount = BigInt(round.vaultAmount);
    adminFees += BigInt(round.totalDeployed) - BigInt(round.totalWinnings) - vaultAmount;
    treasuryShare += vaultAmount;
  }

  dailyFees.addGasToken(adminFees, "Mining admin fee");
  dailyFees.addGasToken(treasuryShare, "Mining Treasury share");
  dailyProtocolRevenue.addGasToken(adminFees, "Mining admin fee");

  // currentVersion reverts before round 1, so the split is read only once the Treasury has income
  if (treasuryShare > 0n) {
    const version = await options.api.call({ target: treasury, abi: "uint256:currentVersion" });
    const [rates] = await options.api.call({ target: treasury, abi: epochAbi, params: [version] });
    const [burn, staking, , referral] = Array.from(rates as any[]).slice(0, 4).map((rate) => BigInt(rate));
    const toBuybacks = treasuryShare * (burn + staking) / BPS;
    const toReferrers = treasuryShare * referral / BPS;
    dailySupplySideRevenue.addGasToken(toReferrers, "Treasury share to referrers");
    dailyHoldersRevenue.addGasToken(toBuybacks, "Treasury share to ELO buybacks");
    dailyProtocolRevenue.addGasToken(treasuryShare - toBuybacks - toReferrers, "Treasury share to reserve and gas");
  }

  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "HYPE taken from settled mining rounds: the 1% admin fee plus the Treasury's cut of the losers' pool (the whole pot after the admin fee when no one wins).",
  Revenue: "Mining fees kept by Eloscape and ELO holders, after the Treasury's referral allocation.",
  SupplySideRevenue: "Part of the Treasury's mining income allocated to referrers.",
  ProtocolRevenue: "The 1% admin fee plus the part of the Treasury's mining income allocated to its reserve and gas funds.",
  HoldersRevenue: "Part of the Treasury's mining income allocated to buying ELO for burns and staking rewards.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-11-12",
  methodology,
  breakdownMethodology: {
    Fees: {
      "Mining admin fee": "1% of the HYPE deployed in each settled round, paid to the fee collector.",
      "Mining Treasury share": "HYPE sent to the Treasury from each settled round.",
    },
    Revenue: {
      "Mining admin fee": "1% of the HYPE deployed in each settled round, paid to the fee collector.",
      "Treasury share to reserve and gas": "Treasury mining income allocated to the reserve and gas funds.",
      "Treasury share to ELO buybacks": "Treasury mining income allocated to buying ELO for burns and staking rewards.",
    },
    SupplySideRevenue: {
      "Treasury share to referrers": "Treasury mining income allocated to referrers.",
    },
    ProtocolRevenue: {
      "Mining admin fee": "1% of the HYPE deployed in each settled round, paid to the fee collector.",
      "Treasury share to reserve and gas": "Treasury mining income allocated to the reserve and gas funds.",
    },
    HoldersRevenue: {
      "Treasury share to ELO buybacks": "Treasury mining income allocated to buying ELO for burns and staking rewards.",
    },
  },
};

export default adapter;
