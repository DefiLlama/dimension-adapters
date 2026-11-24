import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Elysium canonical mining grid and its V2 Treasury, from round 1.
const grid = "0xFa5856b6f352C0E7863D7F5502564130215bf80F";
const treasury = "0xDB7CEA5D88492330BBd9FD3E9c7cd91A3604BB95";
// Round 1 settlement: https://elysium.kinetiq.xyz/tx/0x2caef5fc10adf6a1491b4161232f8959df68926b79919c2bafa0dfe4399e496e
const firstSettlementBlock = 5534257;
const settledEvent = "event RoundSettled(uint64 indexed roundId,uint8 winningBlock,address topMiner,uint256 totalWinnings,uint256 topMinerReward,uint256 motherlodeAmount,bool isSplit,uint256 topMinerSeed,uint256 winnersDeployed,uint256 rot,uint256 manualOnWinning,uint256 topMinerTarget,uint256 totalDeployed,uint256 vaultAmount)";
const epochAbi = "function epoch(uint256) view returns (((uint16,uint16,uint16,uint16,uint16,address,address,address,address,address),uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))";
const bps = 10000n;
// Treasury v14 assigned its 15% stream to this router: https://elysium.kinetiq.xyz/tx/0x12f9b4324d789bed0f7b9a17cf4664406de0cec8eaa219a6dec87a889c161a48
const taxRouter = "0xae707ebe0819b36a4d5cbee6b1a267a9bda6e205";

// Epoch revenue and referral earnings are cumulative. The buyback allocation
// combines the burn and staking rates before integer division in receiveVault.
async function treasuryTotals(api: FetchOptions["api"], block: number) {
  const total = { received: 0n, referral: 0n, holder: 0n, pending: 0n };
  if (block < firstSettlementBlock) return total;
  const version = Number(await api.call({ target: treasury, abi: "uint256:currentVersion", block }));
  const calls = Array.from({ length: version }, (_, i) => ({ params: [i + 1] }));
  const [epochs, extraStreams] = await Promise.all([
    api.multiCall({ abi: epochAbi, target: treasury, block, calls }),
    api.multiCall({ abi: "function extraStreams(uint256) view returns ((bytes32,address,uint16)[])", target: treasury, block, calls }),
  ]);
  for (const [i, epoch] of epochs.entries()) {
    const rates = Array.from(epoch[0]).slice(0, 5).map(v => BigInt(String(v)));
    const [burn, staking, reserve, referral, gas] = rates;
    const baseBps = burn + staking + reserve + referral + gas;
    const routerBps = bps - baseBps;
    const streams = extraStreams[i];
    if (routerBps !== 0n || streams.length !== 0) {
      if (streams.length !== 1 || streams[0][1].toLowerCase() !== taxRouter || BigInt(streams[0][2]) !== routerBps)
        throw Error("Unclassified extra Treasury stream");
    }
    const received = BigInt(epoch[1]);
    const buybacks = received * (burn + staking) / bps;
    // When a version closes, Treasury assigns residual wei to buybacks first.
    const dust = received - buybacks - received * reserve / bps - received * referral / bps - received * gas / bps - received * routerBps / bps;
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
    // The canonical grid charges 1% of deployed HYPE (round settlement policy).
    // https://elysium.kinetiq.xyz/address/0xFa5856b6f352C0E7863D7F5502564130215bf80F
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
  const referralAllocation = earned + pendingChange;
  const revenue = admin + vault - referralAllocation;
  const balance = (wei: bigint, label: string) => {
    const balances = options.createBalances();
    // A net release is a signed total; breakdown labels only represent positive allocations.
    balances.addGasToken(wei.toString(), wei > 0n ? label : undefined);
    return balances;
  };
  const dailyFees = balance(admin, "Mining admin fee");
  dailyFees.addGasToken(vault.toString(), "Mining Treasury share");
  return {
    dailyVolume: balance(volume, "Settled mining principal"), dailyFees,
    dailyRevenue: balance(revenue, "Mining revenue"),
    dailySupplySideRevenue: balance(referralAllocation, "Net referral allocation"),
    dailyProtocolRevenue: balance(revenue - holders, "Protocol share"),
    dailyHoldersRevenue: balance(holders, "Buyback allocation"),
  };
};

const methodology = {
  Volume: "Native HYPE deployed in settled mining rounds, including automatic participation. Mining activity only.",
  Fees: "HYPE collected at mining settlement by the fee collector and Treasury.",
  Revenue: "Settlement fees less earned referrals and the increase in unclassified referral liabilities. Unused referral reserves enter revenue when classified.",
  SupplySideRevenue: "Daily net of earned referrals and the change in pending referral reserves. The label shows the positive daily net; a net release remains signed in the total.",
  ProtocolRevenue: "Recognized revenue retained for the protocol, including the admin fee, reserve, operating allocations and funding routed to the protocol-controlled tax router.",
  HoldersRevenue: "Treasury mining revenue allocated to buy ELO for burning or staking rewards, at the historical version's rates. Executions are counted only at funding accrual.",
};
const adapter: SimpleAdapter = {
  // Hourly positive labels would overstate referrals when a later hour releases reserves.
  // Net the entire reporting day before emitting its single referral breakdown.
  pullHourly: false,
  version: 2, chains: [CHAIN.ELYSIUM], start: "2026-11-12", fetch, methodology,
  // Releases of previously reserved referrals can exceed new accruals in a period.
  allowNegativeValue: true,
  breakdownMethodology: {
    Fees: { "Mining admin fee": "Fee paid to the mining fee collector.", "Mining Treasury share": "HYPE received by Treasury from settled rounds." },
    Revenue: { "Mining revenue": methodology.Revenue },
    ProtocolRevenue: { "Protocol share": methodology.ProtocolRevenue },
    SupplySideRevenue: { "Net referral allocation": methodology.SupplySideRevenue },
    HoldersRevenue: { "Buyback allocation": methodology.HoldersRevenue },
    Volume: { "Settled mining principal": methodology.Volume },
  },
};
export default adapter;
