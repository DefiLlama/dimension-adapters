import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";


const pools: string[] = [
  '0x8bbd80f88e662e56b918c353da635e210ece93c6',
  '0x1e73b5c1a3570b362d46ae9bf429b25c05e514a7',
  '0x95715d3dcbb412900deaf91210879219ea84b4f8',
  '0x0e2e11dc77bbe75b2b65b57328a8e4909f7da1eb',
  '0x7bdf2679a9f3495260e64c0b9e0dfeb859bad7e0',
  '0x4b2ae066681602076adbe051431da7a3200166fd',
  '0x1cc90f7bb292dab6fa4398f3763681cfe497db97',
  '0x3634855ec1beaf6f9be0f7d2f67fc9cb5f4eeea4',
  '0x67df471eacd82c3dbc95604618ff2a1f6b14b8a1',
  '0x2107ade0e536b8b0b85cca5e0c0c3f66e58c053c',
  '0x9e8b9182abba7b4c188c979bc8f4c79f7f4c90d3',
  '0xfce88c5d0ec3f0cb37a044738606738493e9b450',
  '0xd798d527f770ad920bb50680dbc202bb0a1dafd6',
  '0xe32c22e4d95cae1fb805c60c9e0026ed57971bcf',
  '0xefeb69edf6b6999b0e3f2fa856a2acf3bdea4ab5',
  '0xc13465ce9ae3aa184eb536f04fdc3f54d2def277',
  '0xaa2ccc5547f64c5dffd0a624eb4af2543a67ba65',
  '0xf74ea34ac88862b7ff419e60e476be2651433e68',
  '0xc9bdd0d3b80cc6efe79a82d850f44ec9b55387ae',
  '0xe6c30756136e07eb5268c3232efbfbe645c1ba5a',
  '0x1d596d28a7923a22aa013b0e7082bba23daa656b',
  '0x6b42b1a43abe9598052bb8c21fd34c46c9fbcb8b',
  '0x418749e294cabce5a714efccc22a8aade6f9db57',
  '0xa49506632ce8ec826b0190262b89a800353675ec',
  '0x00c27fc71b159a346e179b4a1608a0865e8a7470',
  '0xd09a57127bc40d680be7cb061c2a6629fe71abef',
  '0xb26b42dd5771689d0a7faeea32825ff9710b9c11',
  '0x759f097f3153f5d62ff1c2d82ba78b6350f223e3',
  '0x89d7c618a4eef3065da8ad684859a547548e6169',
  '0xd43a4f3041069c6178b99d55295b00d0db955bb5',
  '0x294371f9ec8b6ddf59d4a2ceba377d19b9735d34',
  '0x538473c3a69da2b305cf11a40cf2f3904de8db5f'
]

const core_pool = '0xb01b315e32d1d9b5ce93e296d483e1f0aad39e75';
const senior_pool = '0x8481a6ebaf5c7dabc3f7e09e44a89531fd31f822';

const fetch = async ({ createBalances, getLogs, }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const InterestCollected = (await getLogs({
    target: core_pool,
    eventAbi: 'event InterestCollected (address indexed payer, uint256 poolAmount, uint256 reserveAmount)'
  }))
  const PaymentApplied = (await getLogs({
    targets: pools,
    eventAbi: 'event PaymentApplied (address indexed payer, address indexed pool, uint256 interestAmount, uint256 principalAmount, uint256 remainingAmount, uint256 reserveAmount)'
  }))
  const ReserveFundsCollected = (await getLogs({
    targets: pools.concat([core_pool, senior_pool]),
    eventAbi: 'event ReserveFundsCollected (address indexed user, uint256 amount)'
  }))
  InterestCollected.forEach((log: any) => {
    dailyFees.addUSDValue(log.poolAmount.toString() / 1e6, METRIC.BORROW_INTEREST)
    dailySupplySideRevenue.addUSDValue(log.poolAmount.toString() / 1e6, METRIC.BORROW_INTEREST)
  });
  PaymentApplied.forEach((log: any) => {
    dailyFees.addUSDValue((log.interestAmount.toString() - log.reserveAmount.toString()) / 1e6, METRIC.BORROW_INTEREST)
    dailySupplySideRevenue.addUSDValue((log.interestAmount.toString() - log.reserveAmount.toString()) / 1e6, METRIC.BORROW_INTEREST)
  });
  ReserveFundsCollected.forEach((log: any) => dailyFees.addUSDValue(log.amount.toString() / 1e6, METRIC.PROTOCOL_FEES));
  ReserveFundsCollected.forEach((log: any) => dailyRevenue.addUSDValue(log.amount.toString() / 1e6, METRIC.PROTOCOL_FEES));

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const adapters: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2021-08-19',
  methodology: {
    Fees: "Interest, payment, and reserve fees paid by users.",
    Revenue: "Reserve fees are revenue.",
    SupplySideRevenue: "Interest and payment fees are distributed to suppliers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.BORROW_INTEREST]: "Interest and Payment Fees collected by the protocol, counted as a fee",
      [METRIC.PROTOCOL_FEES]: "Reserve funds collected across all pools, counted as a protocol fee",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Reserve funds retained by the protocol as revenue",
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "interest and Payment Fees distributed to liquidity suppliers",
    },
  }
}
export default adapters;
