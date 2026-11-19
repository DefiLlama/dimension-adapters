import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";
import { fetchTransactionFees } from "../helpers/getChainFees";
import { METRIC } from "../helpers/metrics";

// Sonic pays gas fees through the SFC 0xFC00FACE00000000000000000000000000000000 (github.com/0xsoniclabs/sonic-sfc, SFC.sol):
// at each epoch seal it mints treasuryFeeShare (90%) of the epoch's fees to the FeeM fee treasury, never mints burntFeeShare
// back (0 until block 57,765,019 on 2025-12-12, 5% since) and pays the rest to validators. The FeeM treasury pays registered
// apps their share and about once a day sends what is left to SFC.distributeExtraReward(epoch, true), which burns
// extraRewardsBurnRatio (50%) of it and stashes the rest for validators (DistributedExtraRewards(epoch, received, distributed)).
// The shares are read at both ends of the window; the FeeM residual is counted when it is sent.
const SFC = '0xFC00FACE00000000000000000000000000000000';
const BURN_LABEL = 'Transaction Gas Fees Burned';
const FEEM_LABEL = 'Transaction Gas Fees To FeeM Apps';
const VALIDATORS_LABEL = 'Transaction Gas Fees To Validators';
// the seal reads the shares when it runs, so the 5% burn applies from epoch 55544 (blocks after 57,764,774, from
// 2025-12-12 12:25:55 UTC), the epoch open when burntFeeShare was set at block 57,765,019. The only share change so far
const BURN_FROM_BLOCK = 57_764_775;

async function getShares(api: FetchOptions['api']) {
  // full signatures, not 'address:...': the sdk caches 'address:' reads per contract across blocks, and both have changed
  // (ConstantsManager 0xe8D29F12... in 2025-12, 0xC7262D6C... now; FeeM treasury 0xB2B5879e... until 2025-04, 0x0B5f0731... now)
  const [consts, feemTreasury] = await api.batchCall([
    { target: SFC, abi: 'function constsAddress() view returns (address)' },
    { target: SFC, abi: 'function treasuryAddress() view returns (address)' },
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

const fetch = async (options: FetchOptions) => {
  const [open, close] = await Promise.all([getShares(options.fromApi), getShares(options.toApi)]);
  const feemTreasury = open.feemTreasury;
  // fees sealed at the opening shares, and at the closing shares when the window holds the burn start
  let dailyFees, openFees;
  const closeFees = options.createBalances();
  const fromBlock = Number(options.fromApi.block), toBlock = Number(options.toApi.block);
  if (fromBlock < BURN_FROM_BLOCK && toBlock >= BURN_FROM_BLOCK) {
    const [res] = await queryAllium(`
      SELECT
        TO_VARCHAR(SUM(gas_price * receipt_gas_used)) AS tx_fees,
        TO_VARCHAR(SUM(IFF(block_number >= ${BURN_FROM_BLOCK}, gas_price * receipt_gas_used, 0))) AS close_fees
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
    options.getLogs({ target: SFC, eventAbi: 'event DistributedExtraRewards(uint256 indexed epochID, uint256 received, uint256 distributed)', entireLog: true, parseLog: true }),
  ]);
  const fromFeem = new Set(feemTxs.map((log: any) => log.transactionHash.toLowerCase()));
  let residual = 0n, residualBurned = 0n;
  for (const log of extraRewards) {
    if (!fromFeem.has(log.transactionHash.toLowerCase())) continue;
    residual += BigInt(log.args.received);
    residualBurned += BigInt(log.args.received) - BigInt(log.args.distributed);
  }

  const dailyRevenue = split(s => s.burntShare, BURN_LABEL);
  dailyRevenue.addGasToken(residualBurned, BURN_LABEL);
  const dailySupplySideRevenue = split(s => s.treasuryShare, FEEM_LABEL);
  dailySupplySideRevenue.addGasToken(-residual, FEEM_LABEL);
  dailySupplySideRevenue.addBalances(split(s => 1 - s.burntShare - s.treasuryShare, VALIDATORS_LABEL));
  dailySupplySideRevenue.addGasToken(residual - residualBurned, VALIDATORS_LABEL);
  return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue.clone(), dailyProtocolRevenue: 0, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SONIC],
  start: '2025-02-05',
  dependencies: [Dependencies.ALLIUM],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  // the FeeM residual is booked in the hour it is sent, so FeeM supply side goes negative in that hour
  allowNegativeValue: true,
  methodology: {
    Fees: 'Transaction fees paid by users for executing transactions on Sonic.',
    Revenue: 'Gas fees burned: the SFC burntFeeShare (0 until 2025-12-12, 5% since), plus from 2025-12-16 the burned half of the FeeM fees left after app payouts, counted on the day the FeeM treasury sends them to the SFC.',
    HoldersRevenue: 'Gas fees burned: the SFC burntFeeShare (0 until 2025-12-12, 5% since), plus from 2025-12-16 the burned half of the FeeM residual.',
    ProtocolRevenue: 'Sonic keeps no gas fees.',
    SupplySideRevenue: 'Gas fees earned by apps through Fee Monetization (FeeM) and by validators: the 90% FeeM share minus the residual the FeeM treasury sends to the SFC (from 2025-12-16), plus the validators\' share of the SFC split (10% until 2025-12-12, 5% since) and half of that residual.',
  },
  breakdownMethodology: {
    Fees: { [METRIC.TRANSACTION_GAS_FEES]: 'Gas fees paid by users for executing transactions on Sonic.' },
    Revenue: { [BURN_LABEL]: 'burntFeeShare of gas fees, never minted back at the epoch seal, plus the extraRewardsBurnRatio share of the FeeM residual sent to SFC.distributeExtraReward.' },
    HoldersRevenue: { [BURN_LABEL]: 'burntFeeShare of gas fees plus the burned share of the FeeM residual.' },
    SupplySideRevenue: {
      [FEEM_LABEL]: 'treasuryFeeShare (90%) of gas fees minted to the FeeM treasury 0x0B5f073135dF3f5671710F08b08C0c9258aECc35 for registered apps, minus the residual it sends to the SFC.',
      [VALIDATORS_LABEL]: 'Gas fees left after the burn and FeeM shares, plus the part of the FeeM residual the SFC stashes for validators.',
    },
  },
};

export default adapter;
