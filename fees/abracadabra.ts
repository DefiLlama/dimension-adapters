import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import type { FetchOptions } from "../adapters/types"
import { METRIC } from "../helpers/metrics";


const cauldrons: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [
    "0x7b7473a76D6ae86CE19f7352A1E89F6C9dc39020",
    "0xc1879bf24917ebE531FbAA20b0D05Da027B592ce",
    "0x9617b633EF905860D919b88E1d9d9a6191795341",
    "0x252dCf1B621Cc53bc22C256255d2bE5C8c32EaE4",
    "0xCfc571f3203756319c231d3Bc643Cee807E74636",
    "0x5ec47EE69BEde0b6C2A2fC0D9d094dF16C192498",
    "0x390Db10e65b5ab920C19149C919D970ad9d18A41",
    "0x257101F20cB7243E2c7129773eD5dBBcef8B34E0",
    "0x4EAeD76C3A388f4a841E9c765560BBe7B3E4B3A0",
    "0x3410297D89dCDAf4072B805EFc1ef701Bb3dd9BF",
    "0x98a84EfF6e008c5ed0289655CcdCa899bcb6B99F",
    "0xf179fe36a36B32a4644587B8cdee7A23af98ed37",
    "0x920D9BD936Da4eAFb5E25c6bDC9f6CB528953F9f",
    "0xEBfDe87310dc22404d918058FAa4D56DC4E93f0A",
    "0x53375adD9D2dFE19398eD65BAaEFfe622760A9A6",
    "0x7Ce7D9ED62B9A6c5aCe1c6Ec9aeb115FA3064757",
    "0xd31E19A0574dBF09310c3B06f3416661B4Dc7324",
    "0xc6B2b3fE7c3D7a6f823D9106E22e66660709001e",
    "0x8227965A7f42956549aFaEc319F4E444aa438Df5",
    "0x692887E8877C6Dd31593cda44c382DB5b289B684",
    "0x85f60D3ea4E86Af43c9D4E9CC9095281fC25c405",
    "0x406b89138782851d3a8C04C743b010CEb0374352",
    "0x207763511da879a900973A5E092382117C3c1588",
    "0x7d8dF3E4D06B0e19960c19Ee673c0823BEB90815",
    "0x7259e152103756e1616A77Ae982353c3751A6a90",
    "0xF75EDb14F320DF35BB1dB1bb4204762431614e46",
    "0x00380CB5858664078F2289180CC32F74440AC923",
    "0x6cbAFEE1FaB76cA5B5e144c43B3B50d42b7C8c8f",
    "0x551a7CfF4de931F32893c928bBc3D25bF1Fc5147",
    "0x6Ff9061bB8f97d948942cEF376d98b51fA38B91f",
    "0xbb02A884621FB8F5BFd263A67F58B65df5b090f3",
    "0xFFbF4892822e0d552CFF317F65e1eE7b5D3d9aE6",
    "0xC319EEa1e792577C319723b5e60a15dA3857E7da",
    "0x806e16ec797c69afa8590A55723CE4CC1b54050E",
    "0x6371EfE5CD6e3d2d7C477935b7669401143b7985",
    "0x003d5A75d284824Af736df51933be522DE9Eed0f",
    "0x05500e2Ee779329698DF35760bEdcAAC046e7C27",
    "0x0BCa8ebcB26502b013493Bf8fE53aA2B1ED401C1",
    "0x35a0Dd182E4bCa59d5931eae13D0A2332fA30321",
  ],
  [CHAIN.FANTOM]: [
    "0x8E45Af6743422e488aFAcDad842cE75A09eaEd34",
    "0xd4357d43545F793101b592bACaB89943DC89d11b",
    "0xed745b045f9495B8bfC7b58eeA8E0d0597884e12",
    "0xa3Fc1B4b7f06c2391f7AD7D4795C1cD28A59917e",
    "0x7208d9F9398D7b02C5C22c334c2a7A3A98c0A45d",
    "0x4fdfFa59bf8dda3F4d5b38F260EAb8BFaC6d7bC1",
    "0xF08e4cc9015a1B8F49A8EEc7c7C64C14B9abD7C7",
    "0xEf7A0bd972672b4eb5DF28f2F544f6b0BF03298a",
  ],
  [CHAIN.AVAX]: [
    "0x3CFEd0439aB822530b1fFBd19536d897EF30D2a2",
    "0xAcc6821d0F368b02d223158F8aDA4824dA9f28E3",
    "0x56984F04d2d04B2F63403f0EbeDD3487716bA49d",
    "0x35fA7A723B3B39f15623Ff1Eb26D8701E7D6bB21",
    "0x3b63f81Ad1fc724E44330b4cf5b5B6e355AD964B",
    "0x95cCe62C3eCD9A33090bBf8a9eAC50b699B54210",
    "0x0a1e6a80E93e62Bd0D3D3BFcF4c362C40FB1cF3D",
    "0x2450Bf8e625e98e14884355205af6F97E3E68d07",
  ],
  [CHAIN.BSC]: [
    "0x692CF15F80415D83E8c0e139cAbcDA67fcc12C90",
    "0xF8049467F3A9D50176f4816b20cDdd9bB8a93319",
  ],
  [CHAIN.ARBITRUM]: [
    "0xC89958B03A55B5de2221aCB25B58B89A000215E6",
    "0x726413d7402fF180609d0EBc79506df8633701B1",
    "0x4F9737E994da9811B8830775Fd73E2F1C8e40741",
    "0x2b02bBeAb8eCAb792d3F4DDA7a76f63Aa21934FA",
    "0xD7659D913430945600dfe875434B6d80646d552A",
    "0x7962ACFcfc2ccEBC810045391D60040F635404fb",
    "0x66805F6e719d7e67D46e8b2501C1237980996C6a",
    "0x5698135CA439f21a57bDdbe8b582C62f090406D5",
  ],
}

const accrueInfoAbi = 'function accrueInfo() view returns (uint64 lastAccrued, uint128 feesEarned, uint64 INTEREST_PER_SECOND)';
const withdrawFeesEvent = 'event LogWithdrawFees(address indexed feeTo, uint256 feesEarnedFraction)';

const getFeesEarned = (accrueInfo: any): bigint => {
  if (!accrueInfo) return 0n;
  if (accrueInfo.output) return getFeesEarned(accrueInfo.output);
  return BigInt(accrueInfo.feesEarned ?? accrueInfo[1] ?? 0);
};

const getWithdrawnFees = (log: any): bigint => BigInt(log.args?.feesEarnedFraction ?? log.args?.[1] ?? log.feesEarnedFraction ?? log[1] ?? 0);

const sumFeesEarned = (values: any[]): bigint => values.reduce((sum, value) => sum + getFeesEarned(value), 0n);

const getAccrueInfos = async (api: FetchOptions["api"], addresses: string[]) => {
  const call = (targets: string[]) => api.multiCall({
    abi: accrueInfoAbi,
    calls: targets.map((target) => ({ target })),
    permitFailure: true,
  });

  try {
    return await call(addresses);
  } catch {
    return (await Promise.all(addresses.map(async (address) => {
      try {
        return (await call([address]))[0];
      } catch {
        return undefined;
      }
    })));
  }
};

const getWithdrawLogs = async (
  { getLogs }: FetchOptions,
  targets: string[],
) => {
  if (!targets.length) return [];
  return getLogs({ targets, eventAbi: withdrawFeesEvent });
};

const fetch = async (options: FetchOptions) => {
  const { createBalances, chain, fromApi, toApi } = options;
  const chainCauldrons = cauldrons[chain];
  const [startValues, endValues] = await Promise.all([
    getAccrueInfos(fromApi, chainCauldrons),
    getAccrueInfos(toApi, chainCauldrons),
  ]);

  const validIndexes = new Set<number>();
  const validCauldrons = chainCauldrons.filter((_, index) => {
    const isValid = Boolean(startValues[index] && endValues[index]);
    if (isValid) validIndexes.add(index);
    return isValid;
  });
  const filteredStartValues = startValues.filter((_, index) => validIndexes.has(index));
  const filteredEndValues = endValues.filter((_, index) => validIndexes.has(index));
  const withdrawLogs = await getWithdrawLogs(options, validCauldrons);

  const startFeesEarned = sumFeesEarned(filteredStartValues);
  const endFeesEarned = sumFeesEarned(filteredEndValues);
  const withdrawnFees = withdrawLogs.reduce((sum, log) => sum + getWithdrawnFees(log), 0n);
  const dailyFeeAmount = Math.max(Number(endFeesEarned - startFeesEarned + withdrawnFees) / 1e18, 0);

  const dailyFees = createBalances();
  dailyFees.addCGToken('magic-internet-money', dailyFeeAmount, METRIC.BORROW_INTEREST);

  const dailyRevenue = dailyFees.clone(0.5, METRIC.PROTOCOL_FEES);

  const dailySupplySideRevenue = createBalances();
  const tempBalance = dailyFees.clone();

  tempBalance.subtract(dailyRevenue);
  dailySupplySideRevenue.addBalances(tempBalance, METRIC.BORROW_INTEREST);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total borrow interest accrued across all Cauldrons (Abracadabra's lending markets)",
  Revenue: "50% of borrow interest retained by the protocol",
  SupplySideRevenue: "50% of borrow interest distributed to MIM lenders",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest accrued from borrowers across all Cauldrons, including both fees earned and fees withdrawn',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: '50% of total borrow interest retained by the Abracadabra protocol',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: '50% of total borrow interest distributed to MIM lenders (users who supply liquidity)',
  },
};


const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.FANTOM, CHAIN.AVAX, CHAIN.BSC, CHAIN.ARBITRUM],
  start: '2021-09-01',
  methodology,
  breakdownMethodology,
}

export default adapter;
