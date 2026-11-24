import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Elysium canonical mining grid and its V2 Treasury, from round 1.
const grid = "0xFa5856b6f352C0E7863D7F5502564130215bf80F";
const treasury = "0xDB7CEA5D88492330BBd9FD3E9c7cd91A3604BB95";
const firstSettlementBlock = 5534257;
const settledEvent = "event RoundSettled(uint64 indexed roundId,uint8 winningBlock,address topMiner,uint256 totalWinnings,uint256 topMinerReward,uint256 motherlodeAmount,bool isSplit,uint256 topMinerSeed,uint256 winnersDeployed,uint256 rot,uint256 manualOnWinning,uint256 topMinerTarget,uint256 totalDeployed,uint256 vaultAmount)";
const epochAbi = "function epoch(uint256) view returns (((uint16,uint16,uint16,uint16,uint16,address,address,address,address,address),uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))";
const bps = 10000n;

// Epoch revenue and referral earnings are cumulative. The buyback allocation
// combines the burn and staking rates before integer division in receiveVault.
async function treasuryTotals(api: FetchOptions["api"], block: number) {
  const total = { received: 0n, referral: 0n, holder: 0n, pending: 0n };
  if (block < firstSettlementBlock) return total;
  const version = Number(await api.call({ target: treasury, abi: "uint256:currentVersion", block }));
  const epochs = await api.multiCall({
    abi: epochAbi, target: treasury, block,
    calls: Array.from({ length: version }, (_, i) => ({ params: [i + 1] })),
  });
  for (const [i, epoch] of epochs.entries()) {
    const rates = Array.from(epoch[0]).slice(0, 5).map(v => BigInt(String(v)));
    const [burn, staking, reserve, referral, gas] = rates;
    if (burn + staking + reserve + referral + gas !== bps) throw Error("Unclassified extra Treasury stream");
    const received = BigInt(epoch[1]);
    const buybacks = received * (burn + staking) / bps;
    // When a version closes, Treasury assigns residual wei to buybacks first.
    const dust = received - buybacks - received * reserve / bps - received * referral / bps - received * gas / bps;
    total.received += received;
    total.holder += buybacks + (i + 1 < version && burn + staking > 0n ? dust : 0n);
    total.referral += BigInt(epoch[10]); // cumulative earned from verified referral reports
    total.pending += BigInt(epoch[4]); // still awaiting a referral report
  }
  return total;
}

const fetch = async (options: FetchOptions) => {
  const start = await options.getFromBlock();
  const end = await options.getToBlock();
  const before = await treasuryTotals(options.fromApi, start - 1);
  const after = await treasuryTotals(options.api, end);
  const rounds = await options.getLogs({ target: grid, eventAbi: settledEvent });
  let volume = 0n, admin = 0n, vault = 0n;
  for (const round of rounds) {
    const deployed = BigInt(round.totalDeployed);
    const treasuryShare = BigInt(round.vaultAmount);
    // Grid splits local HYPE between winners, the fee collector and Treasury.
    const collector = deployed - BigInt(round.totalWinnings) - treasuryShare;
    if (collector < 0n || collector !== deployed / 100n) throw Error("Unrecognized mining fee policy");
    volume += deployed;
    admin += collector;
    vault += treasuryShare;
  }
  if (vault !== after.received - before.received) throw Error("Settlement and Treasury receipts differ");
  const earned = after.referral - before.referral;
  const pendingChange = after.pending - before.pending;
  const holders = after.holder - before.holder;
  const revenue = admin + vault - earned - pendingChange;
  const balance = (wei: bigint, label: string) => {
    const balances = options.createBalances();
    balances.addGasToken(wei.toString(), label);
    return balances;
  };
  const dailyFees = balance(admin, "Mining admin fee");
  dailyFees.addGasToken(vault.toString(), "Mining Treasury share");
  return {
    dailyVolume: balance(volume, "Settled mining principal"), dailyFees,
    dailyRevenue: balance(revenue, "Mining revenue"),
    dailySupplySideRevenue: balance(earned, "Earned referrals"),
    dailyProtocolRevenue: balance(revenue - holders, "Protocol share"),
    dailyHoldersRevenue: balance(holders, "Buyback allocation"),
  };
};

const methodology = {
  Volume: "Native HYPE deployed in settled mining rounds, including automatic participation. Mining activity only.",
  Fees: "HYPE collected at mining settlement by the fee collector and Treasury.",
  Revenue: "Settlement fees less earned referrals and the increase in unclassified referral liabilities. Unused referral reserves enter revenue when classified.",
  SupplySideRevenue: "Referral earnings recognized when Treasury accepts the referral report.",
  ProtocolRevenue: "Recognized revenue retained for the protocol, including the admin fee, reserve and operating allocations.",
  HoldersRevenue: "Treasury mining revenue allocated to buy ELO for burning or staking rewards, at the historical version's rates. Executions are counted only at funding accrual.",
};
const adapter: SimpleAdapter = {
  version: 2, pullHourly: true, chains: [CHAIN.ELYSIUM], start: "2026-11-12", fetch, methodology,
  breakdownMethodology: {
    Fees: { "Mining admin fee": "Fee paid to the mining fee collector.", "Mining Treasury share": "HYPE received by Treasury from settled rounds." },
    Revenue: { "Mining revenue": methodology.Revenue },
    ProtocolRevenue: { "Protocol share": methodology.ProtocolRevenue },
    SupplySideRevenue: { "Earned referrals": methodology.SupplySideRevenue },
    HoldersRevenue: { "Buyback allocation": methodology.HoldersRevenue },
    Volume: { "Settled mining principal": methodology.Volume },
  },
};
export default adapter;
