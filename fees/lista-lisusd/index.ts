import ADDRESSES from '../../helpers/coreAssets.json'
import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Fetches data from Lista DAO
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-lisusd
 *
 * @treasury
 * https://bscscan.com/address/0x8d388136d578dcd791d081c6042284ced6d9b0c6#tokentxns
 * https://bscscan.com/address/0x34b504a5cf0ff41f8a480580533b6dda687fa3da#tokentxns
 */

const newTreasuryActivationTime = 1727222400 //2024-09-25;

const oldTreasury =
  "0x0000000000000000000000008d388136d578dcd791d081c6042284ced6d9b0c6";
const newTreasury =
  "0x00000000000000000000000034b504a5cf0ff41f8a480580533b6dda687fa3da";
const zeroAddress =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const transferHash =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const HelioETHProvider = "0x0326c157bfF399e25dd684613aEF26DBb40D3BA4";
// const MasterVault = "0x986b40C2618fF295a49AC442c5ec40febB26CC54";
const SnBnbYieldConverterStrategy =
  "0x0000000000000000000000006f28fec449dbd2056b76ac666350af8773e03873";
const CeETHVault = "0xA230805C28121cc97B348f8209c79BEBEa3839C0";
const HayJoin = "0x4C798F81de7736620Cd8e6510158b1fE758e22F7";

// token
const lista = "0xFceB31A79F71AC9CBDCF853519c1b12D379EdC46";
const cake = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const slisBNB = "0xb0b84d294e0c75a6abe60171b70edeb2efd14a1b";
const eth = ADDRESSES.bsc.ETH;
const wbeth = ADDRESSES.bsc.wBETH;
const bnb = ADDRESSES.bsc.WBNB;
const lisUSD = "0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5";
const usdt = ADDRESSES.bsc.USDT;
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const treasury = options.startOfDay>=newTreasuryActivationTime?newTreasury:oldTreasury;

  // eth staking profit - helioETHProvider and CeETHVault
  const ethStakingEth = await options.getLogs({
    target: eth,
    topics: [
      transferHash,
      "0x000000000000000000000000a230805c28121cc97b348f8209c79bebea3839c0",
      treasury,
    ],
  });

  const ethStakingWbeth = await options.getLogs({
    target: wbeth,
    topics: [
      transferHash,
      "0x000000000000000000000000a230805c28121cc97b348f8209c79bebea3839c0",
      treasury,
    ],
  });

  // BNB provide Fee - MasterVault
  // No fees charged for now

  // bnb liquid staking profit - SnBnbYieldConverterStrategy
  const bnbLiquidStakingProfit = await options.getLogs({
    target: slisBNB,
    topics: [transferHash, SnBnbYieldConverterStrategy, treasury],
  });

  // borrow lisUSD interest
  const borrowLisUSDInterest = await options.getLogs({
    target: lisUSD,
    topics: [transferHash, zeroAddress, treasury],
  });

  // veLista early claim penalty
  const veListaEarlyClaimPenalty = await options.getLogs({
    target: lista,
    topics: [
      transferHash,
      "0x000000000000000000000000d0c380d31db43cd291e2bbe2da2fd6dc877b87b3",
      treasury,
    ],
  });

  //liquidation profit - flash buy

  const liquidationProfit = await options.getLogs({
    target: lisUSD,
    topics: [
      transferHash,
      "0x0000000000000000000000009ba88e6b20041750fd4e6271fea455f5d44063cb",
      newTreasury,
    ],
  });

  // liquidation profit - liquidation bot
  const liquidationBot = await options.getLogs({
    target: lisUSD,
    topics: [
      transferHash,
      "0x00000000000000000000000008e83a96f4da5decc0e6e9084dde049a3e84ca04",
      treasury,
    ],
  });

  // PSM convert Fee
  const psmConvertFee = await options.getLogs({
    target: lisUSD,
    topics: [
      transferHash,
      "0x000000000000000000000000aa57f36dd5ef2ac471863ec46277f976f272ec0c",
      newTreasury,
    ],
  });

  // USDT staking profit - venusAdaptor
  const usdtStakingProfit = await options.getLogs({
    target: usdt,
    topics: [
      transferHash,
      "0x000000000000000000000000f76d9cfd08df91491680313b1a5b44307129cda9",
      "0x0000000000000000000000008d388136d578dcd791d081c6042284ced6d9b0c6",
    ],
  });

  // veLista Auto Compound Fee - VeListaAutoCompounder
  const veListaAutoCompoundFee = await options.getLogs({
    target: lista,
    topics: [
      transferHash,
      "0x0000000000000000000000009a0530a81c83d3b0dae720bf91c9254fecc3bf5e",
      newTreasury,
    ],
  });

  // validaator rewards - stake ListaDAOCredit
  const validatorRewards = await options.getLogs({
    target: "0x0D92Ac7a4590874a493eB62b37D3Ea3390966B13",
    // topics: [
    //   "0x8119d5d4b103c44e50f575099834c726e011a0ffd633ba386e8e0a0d61c659c3" // SafeReceived event topic
    // ],
    eventAbi: "event SafeReceived(address indexed sender, uint256 value)",
  });

  // LP staking rewards
  const lpStakeRewardsFromHash =
    "0x00000000000000000000000062dfec5c9518fe2e0ba483833d1bad94ecf68153";
  const lpStakeRewardsToHash =
    "0x00000000000000000000000085ce862c5bb61938ffcc97da4a80c8aae43c6a27";
  const lpStakingCakeRewards = await options.getLogs({
    target: cake,
    topics: [transferHash, lpStakeRewardsFromHash, lpStakeRewardsToHash],
  });
  const lpStakingListaRewards = await options.getLogs({
    target: lista,
    topics: [transferHash, lpStakeRewardsFromHash, lpStakeRewardsToHash],
  });

  // freeze lista
  const freezeLista = await options.getLogs({
    target: lista,
    topics: [
      transferHash,
      "0x000000000000000000000000e4153eb04417be05b8d6b2222e4cdd8ae674ee76",
      "0x000000000000000000000000000000000000000000000000000000000000dead",
    ],
  });

  [ ...ethStakingEth].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(eth, amount);
  });
  [...ethStakingWbeth].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(wbeth, amount);
  });

  [ ...bnbLiquidStakingProfit].forEach(
    (log) => {
      const amount = Number(log.data);

      dailyFees.add(slisBNB, amount);
    }
  );
  [...borrowLisUSDInterest].forEach((log) => {
    const amount = Number(log.data);

    dailyFees.add(lisUSD, amount);
  });
  [...veListaEarlyClaimPenalty].forEach(
    (log) => {
      const amount = Number(log.data);

      dailyFees.add(lista, amount);
    }
  );
  [...liquidationProfit].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(lisUSD, amount);
  });

  [...veListaAutoCompoundFee].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(lista, amount);
  });

  [...liquidationBot].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(lisUSD, amount);
  });
  [...psmConvertFee].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(lisUSD, amount);
  });
  [...usdtStakingProfit].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(usdt, amount);
  });
  [...validatorRewards].forEach((log) => {
    dailyFees.add(bnb, Number(log.value));
  });
  [...lpStakingListaRewards].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(lista, amount);
  });
  [...lpStakingCakeRewards].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.add(cake, amount);
  });
  [...freezeLista].forEach((log) => {
    const amount = Number(log.data);
    dailyFees.subtractToken(lista, amount);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2023-08-30",
    },
  },
};

export default adapter;
