import { fetchChainTransactionFeesExport, fetchTransactionFees, getOneDayFees } from "../helpers/getChainFees";
import { CHAIN } from "../helpers/chains";
import { fetchEvmChainMetricsFromOptions } from "../helpers/evmChainFees";
import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { METRIC } from "../helpers/metrics";
import { queryAllium } from "../helpers/allium";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../utils/date";
import { createFactoryExports } from "./registry";

// EVM chains read from Allium; all transaction fees count as revenue
const alliumFeesConfigs: Record<string, { chain: CHAIN; start: string }> = {
  "berachain": { chain: CHAIN.BERACHAIN, start: "2025-02-05" },
  "core": { chain: CHAIN.CORE, start: "2023-04-19" },
  "fraxtal": { chain: CHAIN.FRAXTAL, start: "2025-02-05" },
  "linea": { chain: CHAIN.LINEA, start: "2025-02-05" },
  "ronin": { chain: CHAIN.RONIN, start: "2025-02-05" },
  "xlayer": { chain: CHAIN.XLAYER, start: "2024-03-30" },
};

// EVM chains read from Allium that burn nothing: every transaction fee is paid out to the block producers
type ValidatorFeesConfig = {
  chain: CHAIN;
  start: string;
  rpcFrom?: string; // windows starting on or after this date sum RPC receipts instead of Allium
  supplySideLabel: string;
  methodology: Record<string, string>;
  breakdownMethodology: Record<string, Record<string, string>>;
};

const alliumValidatorFeesConfigs: Record<string, ValidatorFeesConfig> = {
  "fantom": {
    chain: CHAIN.FANTOM, start: '2020-09-02',
    // Allium fantom.raw.transactions stopped at 2026-10-21 17:59 UTC (block 123771716) while the chain kept producing blocks.
    // RPC receipts matched Allium to the wei on 2026-10-20 10:00-11:00 UTC (459 txs).
    rpcFrom: '2026-10-21',
    supplySideLabel: 'Transaction Gas Fees To Validators',
    methodology: {
      Fees: 'Transaction fees paid by users for executing transactions on Fantom Opera.',
      SupplySideRevenue: 'Transaction fees distributed to validators. Fantom does not burn gas fees.',
      Revenue: 'Fantom does not retain transaction fees; all gas fees are paid to validators.',
    },
    breakdownMethodology: {
      Fees: { [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on Fantom Opera.' },
      SupplySideRevenue: { 'Transaction Gas Fees To Validators': 'Gas fees distributed to validators for securing the network.' },
    },
  },
  "xdc": {
    chain: CHAIN.XDC, start: '2019-06-01',
    supplySideLabel: 'Transaction Gas Fees To Masternode Operators',
    methodology: {
      Fees: 'Transaction fees paid by users for executing transactions on the XDC Network.',
      SupplySideRevenue: 'Transaction fees distributed to masternode operators. XDC does not burn gas fees.',
      Revenue: 'XDC does not retain transaction fees; all gas fees are paid to masternode operators.',
    },
    breakdownMethodology: {
      Fees: { [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on the XDC Network.' },
      SupplySideRevenue: { 'Transaction Gas Fees To Masternode Operators': 'Gas fees distributed to masternode operators for validating transactions.' },
    },
  },
};

function validatorFeesExport({ chain, start, rpcFrom, supplySideLabel, methodology, breakdownMethodology }: ValidatorFeesConfig): SimpleAdapter {
  const rpcFromTimestamp = rpcFrom ? Date.parse(rpcFrom) / 1000 : Infinity;

  const fetchFees = async (options: FetchOptions) => {
    if (options.startTimestamp < rpcFromTimestamp) return fetchTransactionFees(options);
    const { totalFeesWei } = await fetchEvmChainMetricsFromOptions(options, { chain, blockChunkSize: 500 });
    const dailyFees = options.createBalances();
    dailyFees.addGasToken(totalFeesWei.toString(), METRIC.TRANSACTION_GAS_FEES);
    return dailyFees;
  };

  return {
    version: 2,
    pullHourly: true,
    chains: [chain],
    start,
    protocolType: ProtocolType.CHAIN,
    dependencies: [Dependencies.ALLIUM],
    isExpensiveAdapter: true,
    methodology,
    breakdownMethodology,
    fetch: async (options: FetchOptions) => {
      const dailyFees = await fetchFees(options);
      return { dailyFees, dailySupplySideRevenue: dailyFees.clone(1, supplySideLabel) };
    },
  };
}

// Sonic pays gas fees through the SFC 0xFC00FACE00000000000000000000000000000000 (github.com/0xsoniclabs/sonic-sfc, SFC.sol):
// at each epoch seal it mints treasuryFeeShare (90%) of the epoch's fees to the FeeM fee treasury, never mints burntFeeShare
// back (0 until block 57,765,019 on 2025-12-12, 5% since) and pays the rest to validators. The FeeM treasury pays registered
// apps their share and about once a day sends what is left to SFC.distributeExtraReward(epoch, true), which burns
// extraRewardsBurnRatio (50%) of it and stashes the rest for validators (DistributedExtraRewards(epoch, received, distributed)).
// The shares are read at both ends of the window; the FeeM residual is counted when it is sent.
// Daily, not hourly: the residual is a once-a-day batch, so an hourly window holding it would go deeply negative.
const SONIC_SFC = '0xFC00FACE00000000000000000000000000000000';
const SONIC_BURN_LABEL = 'Transaction Gas Fees Burned';
const SONIC_FEEM_LABEL = 'Transaction Gas Fees To FeeM Apps';
const SONIC_VALIDATORS_LABEL = 'Transaction Gas Fees To Validators';
// the seal reads the shares when it runs, so the 5% burn applies from epoch 55544 (blocks after 57,764,774, from
// 2025-12-12 12:25:55 UTC), the epoch open when burntFeeShare was set at block 57,765,019. The only share change so far
const SONIC_BURN_FROM_BLOCK = 57_764_775;

async function getSonicShares(api: FetchOptions['api']) {
  // full signatures, not 'address:...': the sdk caches 'address:' reads per contract across blocks, and both have changed
  // (ConstantsManager 0xe8D29F12... in 2025-12, 0xC7262D6C... now; FeeM treasury 0xB2B5879e... until 2025-04, 0x0B5f0731... now)
  const [consts, feemTreasury] = await api.batchCall([
    { target: SONIC_SFC, abi: 'function constsAddress() view returns (address)' },
    { target: SONIC_SFC, abi: 'function treasuryAddress() view returns (address)' },
  ]);
  const [burnt, treasury] = await api.batchCall([
    { target: consts, abi: 'uint256:burntFeeShare' },
    { target: consts, abi: 'uint256:treasuryFeeShare' },
  ]);
  const burntShare = Number(burnt) / 1e18;
  const treasuryShare = Number(treasury) / 1e18;
  if (!(burntShare >= 0 && treasuryShare >= 0 && burntShare + treasuryShare <= 1))
    throw new Error(`sonic: invalid SFC fee shares at block ${api.block}: burnt ${burnt}, treasury ${treasury}`);
  return { feemTreasury, burntShare, treasuryShare };
}

async function fetchSonicFees(options: FetchOptions) {
  const [open, close] = await Promise.all([getSonicShares(options.fromApi), getSonicShares(options.toApi)]);
  const feemTreasury = open.feemTreasury;
  // fees sealed at the opening shares, and at the closing shares when the window holds the burn start
  let dailyFees, openFees;
  const closeFees = options.createBalances();
  const fromBlock = Number(options.fromApi.block), toBlock = Number(options.toApi.block);
  if (fromBlock < SONIC_BURN_FROM_BLOCK && toBlock >= SONIC_BURN_FROM_BLOCK) {
    const [res] = await queryAllium(`
      SELECT
        TO_VARCHAR(SUM(gas_price * receipt_gas_used)) AS tx_fees,
        TO_VARCHAR(SUM(IFF(block_number >= ${SONIC_BURN_FROM_BLOCK}, gas_price * receipt_gas_used, 0))) AS close_fees
      FROM sonic.raw.transactions
      WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    `);
    if (res?.tx_fees == null) throw new Error('[Pull fees transactions] Allium sonic.raw.transactions has no rows in the window');
    dailyFees = options.createBalances();
    dailyFees.addGasToken(res.tx_fees, METRIC.TRANSACTION_GAS_FEES);
    openFees = options.createBalances();
    openFees.addGasToken((BigInt(res.tx_fees) - BigInt(res.close_fees)).toString());
    closeFees.addGasToken(res.close_fees);
  } else {
    if (open.burntShare !== close.burntShare || open.treasuryShare !== close.treasuryShare)
      throw new Error(`sonic: SFC fee shares changed between blocks ${fromBlock} and ${toBlock}, find the epoch the new shares apply from`);
    dailyFees = await fetchTransactionFees(options);
    openFees = dailyFees;
  }
  const split = (share: (s: typeof open) => number, label: string) => {
    const balances = openFees.clone(share(open), label);
    balances.addBalances(closeFees.clone(share(close), label));
    return balances;
  };

  // every distributeExtraReward call on the SFC so far comes from the FeeM treasury (from 2025-12-16); keep only those
  const [feemTxs, extraRewards] = await Promise.all([
    options.getLogs({ target: feemTreasury, eventAbi: 'event ValidatorsRewarded(uint256 indexed startEpoch, uint256 indexed endEpoch, uint256 amount)', entireLog: true }),
    options.getLogs({ target: SONIC_SFC, eventAbi: 'event DistributedExtraRewards(uint256 indexed epochID, uint256 received, uint256 distributed)', entireLog: true, parseLog: true }),
  ]);
  const fromFeem = new Set(feemTxs.map((log: any) => log.transactionHash.toLowerCase()));
  let residual = 0n, residualBurned = 0n;
  for (const log of extraRewards) {
    if (!fromFeem.has(log.transactionHash.toLowerCase())) continue;
    residual += BigInt(log.args.received);
    residualBurned += BigInt(log.args.received) - BigInt(log.args.distributed);
  }

  const dailyRevenue = split(s => s.burntShare, SONIC_BURN_LABEL);
  dailyRevenue.addGasToken(residualBurned, SONIC_BURN_LABEL);
  const dailySupplySideRevenue = split(s => s.treasuryShare, SONIC_FEEM_LABEL);
  dailySupplySideRevenue.addGasToken(-residual, SONIC_FEEM_LABEL);
  dailySupplySideRevenue.addBalances(split(s => 1 - s.burntShare - s.treasuryShare, SONIC_VALIDATORS_LABEL));
  dailySupplySideRevenue.addGasToken(residual - residualBurned, SONIC_VALIDATORS_LABEL);
  return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue.clone(), dailyProtocolRevenue: 0, dailySupplySideRevenue };
}

const sonicAdapter: SimpleAdapter = {
  version: 1,
  adapter: { [CHAIN.SONIC]: { fetch: fetchSonicFees, start: '2025-02-05' } },
  dependencies: [Dependencies.ALLIUM],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  allowNegativeValue: true, // the FeeM residual sent in a day covers the previous day's epochs and can exceed the FeeM share of a quiet day
  methodology: {
    Fees: 'Transaction fees paid by users for executing transactions on Sonic.',
    Revenue: 'Gas fees burned: the SFC burntFeeShare (0 until 2025-12-12, 5% since), plus from 2025-12-16 the burned half of the FeeM fees left after app payouts, counted on the day the FeeM treasury sends them to the SFC.',
    HoldersRevenue: 'Gas fees burned: the SFC burntFeeShare (0 until 2025-12-12, 5% since), plus from 2025-12-16 the burned half of the FeeM residual.',
    ProtocolRevenue: 'Sonic keeps no gas fees.',
    SupplySideRevenue: 'Gas fees earned by apps through Fee Monetization (FeeM) and by validators: the 90% FeeM share minus the residual the FeeM treasury sends to the SFC (from 2025-12-16), plus the validators\' share of the SFC split (10% until 2025-12-12, 5% since) and half of that residual.',
  },
  breakdownMethodology: {
    Fees: { [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on Sonic.' },
    Revenue: { [SONIC_BURN_LABEL]: 'burntFeeShare of gas fees, never minted back at the epoch seal, plus the extraRewardsBurnRatio share of the FeeM residual sent to SFC.distributeExtraReward.' },
    HoldersRevenue: { [SONIC_BURN_LABEL]: 'burntFeeShare of gas fees plus the burned share of the FeeM residual.' },
    SupplySideRevenue: {
      [SONIC_FEEM_LABEL]: 'treasuryFeeShare (90%) of gas fees minted to the FeeM treasury 0x0B5f073135dF3f5671710F08b08C0c9258aECc35 for registered apps, minus the residual it sends to the SFC.',
      [SONIC_VALIDATORS_LABEL]: 'Gas fees left after the burn and FeeM shares, plus the part of the FeeM residual the SFC stashes for validators.',
    },
  },
};

// Non-EVM chains: the day's total fees in the native coin from CoinMetrics (FeeTotNtv), priced by CoinGecko id.
// No protocol revenue: the fees go to miners / validators.
const coinMetricsFeesConfigs: Record<string, { chain: CHAIN; assetId: string; cgId: string; start: string }> = {
  "bitcoin": { chain: CHAIN.BITCOIN, assetId: 'btc', cgId: 'bitcoin', start: '2009-01-03' },
  "bitcoin-cash": { chain: CHAIN.BITCOIN_CASH, assetId: 'bch', cgId: 'bitcoin-cash', start: '2017-08-01' },
  "doge": { chain: CHAIN.DOGE, assetId: 'doge', cgId: 'dogecoin', start: '2013-12-08' },
  "monero": { chain: CHAIN.MONERO, assetId: 'xmr', cgId: 'monero', start: '2014-04-18' },
  "ripple": { chain: CHAIN.RIPPLE, assetId: 'xrp', cgId: 'ripple', start: '2012-06-01' }, // Ripple launched in 2012, approximate launch date
};

function coinMetricsFeesExport({ chain, assetId, cgId, start }: { chain: CHAIN; assetId: string; cgId: string; start: string }): SimpleAdapter {
  return {
    version: 1,
    adapter: {
      [chain]: {
        fetch: async (options: FetchOptions) => {
          const today = new Date(getTimestampAtStartOfDayUTC(options.toTimestamp) * 1000).toISOString();
          const yesterday = new Date(getTimestampAtStartOfPreviousDayUTC(options.toTimestamp) * 1000).toISOString();
          const fees = await getOneDayFees(assetId, yesterday, today);
          const dailyFees = options.createBalances();
          dailyFees.addCGToken(cgId, fees);
          return { dailyFees, dailyRevenue: 0 };
        },
        start,
      },
    },
    protocolType: ProtocolType.CHAIN,
  };
}

const feesProtocols: Record<string, any> = {};
for (const [name, config] of Object.entries(alliumFeesConfigs)) {
  feesProtocols[name] = fetchChainTransactionFeesExport(config);
}
for (const [name, config] of Object.entries(alliumValidatorFeesConfigs)) {
  feesProtocols[name] = validatorFeesExport(config);
}
feesProtocols["sonic"] = sonicAdapter;
for (const [name, config] of Object.entries(coinMetricsFeesConfigs)) {
  feesProtocols[name] = coinMetricsFeesExport(config);
}

export const { protocolList, getAdapter } = createFactoryExports(feesProtocols);
