import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const OFFCHAIN_EXCHANGE = "0x8373C3Aa04153aBc0cfD28901c3c971a946994ab";
const BUILDER_ID_PADDED = "0x" + (900).toString(16).padStart(64, "0");

// Otomate Earn wrappers. Deployment blocks are from each proxy's creation transaction:
// https://explorer.inkonchain.com/address/<vault>
const VAULTS = [
  { target: "0x919C57BF59484798Ff2f90018640fd0A08242aC2", block: 39817878 }, // USDT0
  { target: "0x2baA4C3f66Fa6f0c2d56242BaAE446a4De878B98", block: 40073655 }, // kBTC
  { target: "0xcc7DcF43b17D8EdC437a6e33a6A325C57eba1ED7", block: 40073901 }, // WETH
  { target: "0x59046e5a0cbb5b64981b4668a31ab3a5ed0e7dd0", block: 40074036 }, // USDC
];

// ATokenVault._accrueYield and getClaimableFees:
// https://explorer.inkonchain.com/address/0xBEDF324cbd1F06b4faa8e20De527FD593Ee0b7c6?tab=contract
// Pending yield at each boundary reconciles sparse accrual events into period earnings.
// Deposits/withdrawals update lastVaultBalance; withdrawing previously accrued fees
// is not revenue again. On-chain fees/events also preserve historical rate changes.
async function pendingYield(api: FetchOptions["api"], block: number) {
  const vaults = VAULTS.filter(v => v.block <= block);
  const result: Record<string, { yield: bigint; fee: bigint }> = {};
  if (!vaults.length) return result;
  const aTokens = await api.multiCall({ abi: "address:ATOKEN", calls: vaults });
  const lastBalances = await api.multiCall({ abi: "uint256:getLastVaultBalance", calls: vaults });
  const fees = await api.multiCall({ abi: "uint256:getFee", calls: vaults });
  const balances = await api.multiCall({
    abi: "erc20:balanceOf",
    calls: vaults.map((v, i) => ({ target: aTokens[i], params: [v.target] })),
  });
  vaults.forEach((vault, i) => {
    const growth = BigInt(balances[i]) - BigInt(lastBalances[i]);
    const yieldAmount = growth > 0n ? growth : 0n; // Matches getClaimableFees.
    result[vault.target.toLowerCase()] = { yield: yieldAmount, fee: yieldAmount * BigInt(fees[i]) / 10n ** 18n };
  });
  return result;
}

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;
  const logs = await getLogs({
    target: OFFCHAIN_EXCHANGE,
    eventAbi:
      "event BuilderFeePayment(bytes32 indexed subaccount, uint32 indexed builder, uint32 indexed productId, bytes32 digest, int128 feeAmount, int128 feeRate, int128 quoteAmount)",
    topics: [null as any, null as any, BUILDER_ID_PADDED],
  });

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  let builderFees = 0;
  let dailyVolume = 0;
  for (const log of logs) {
    builderFees += Math.abs(Number(log.feeAmount)) / 1e18;
    dailyVolume += Math.abs(Number(log.quoteAmount)) / 1e18;
  }
  dailyFees.addUSDValue(builderFees, "Nado Builder Fees");
  dailyRevenue.addUSDValue(builderFees, "Nado Builder Fees To Otomate");

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const activeVaults = VAULTS.filter(v => v.block <= toBlock);
  if (activeVaults.length && toBlock > fromBlock) {
    const before = await pendingYield(options.fromApi, fromBlock);
    const after = await pendingYield(options.toApi, toBlock);
    const assets = await options.toApi.multiCall({ abi: "address:asset", calls: activeVaults });
    const accrued = await getLogs({
      targets: activeVaults.map(v => v.target),
      fromBlock: fromBlock + 1,
      toBlock,
      eventAbi: "event YieldAccrued(uint256 accruedYield, uint256 newFeesFromYield, uint256 newVaultBalance)",
      onlyArgs: false,
    });
    for (const [i, vault] of activeVaults.entries()) {
      const key = vault.target.toLowerCase();
      let yieldAmount = after[key].yield - (before[key]?.yield ?? 0n);
      let feeAmount = after[key].fee - (before[key]?.fee ?? 0n);
      for (const log of accrued) {
        if (log.address.toLowerCase() !== key) continue;
        yieldAmount += BigInt(log.args.accruedYield);
        feeAmount += BigInt(log.args.newFeesFromYield);
      }
      dailyFees.add(assets[i], yieldAmount, "Tydro Lending Yield");
      dailyRevenue.add(assets[i], feeAmount, "Tydro Performance Fees To Otomate");
      dailySupplySideRevenue.add(assets[i], yieldAmount - feeAmount, "Tydro Yield To Depositors");
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue, dailyVolume };
};

const methodology = {
  Fees: "Nado builder fees plus lending interest earned by Otomate's Tydro vaults, excluding incentive tokens.",
  Revenue: "Nado builder fees and the Tydro vault performance fees retained by Otomate, using the on-chain fee rate.",
  ProtocolRevenue: "All Otomate builder and vault performance fees accrue to the protocol.",
  SupplySideRevenue: "Tydro vault interest earned by depositors after Otomate's performance fee.",
  Volume: "Notional trading volume routed through Otomate builder code on Nado; vault deposits and withdrawals are excluded.",
};

const breakdownMethodology = {
  Fees: {
    "Nado Builder Fees": "Builder fees charged on trades routed through Otomate on Nado.",
    "Tydro Lending Yield": "Vault lending interest accrued during the period, reconciling accrual events with pending interest at both boundaries.",
  },
  Revenue: {
    "Nado Builder Fees To Otomate": "All builder fees accrue to Otomate.",
    "Tydro Performance Fees To Otomate": "The vault's on-chain performance fee on lending interest; fee withdrawals are not counted again.",
  },
  ProtocolRevenue: {
    "Nado Builder Fees To Otomate": "All builder fees accrue to Otomate.",
    "Tydro Performance Fees To Otomate": "Performance fees reserved for the vault owner, Otomate.",
  },
  SupplySideRevenue: {
    "Tydro Yield To Depositors": "Lending interest less the vault's on-chain performance fee.",
  },
};

export default {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.INK],
  fetch,
  start: "2025-11-15",
  methodology,
  breakdownMethodology,
  doublecounted: true, // Underlying trading and lending are already tracked under Nado and Tydro.
} as Adapter;
