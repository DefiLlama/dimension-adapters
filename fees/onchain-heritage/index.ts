// fees/onchain-heritage/index.ts
// Onchain Heritage — Fees/Revenue (Optimism)
// نهج بلا Indexer ولا .env:
// نحسب عدد أحداث `Participated` خلال اليوم × رسم ثابت لكل مشاركة (ETH)

import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// ======== اضبط قيمة الرسم الثابت لكل مشاركة هنا (بالـ wei) ========
// مثال: 0.001 ETH = 1e15 wei  →  1000000000000000n
// عدّلها إلى قيمة رسمك الفعلية!
const FEE_PER_PARTICIPATION_WEI = 0n; // 0.001 ETH (مثال)

// ABI الحدث الذي سنعدّه
const PARTICIPATED_EVENT =
  "event Participated(address indexed user, uint256 userTotal, uint256 total)";

// عنوان عقدك على Optimism
const CONTRACT = "0x988Ac408aBCa2032E2a2DF9E0296c5e3416Cc15b";

const fetch = async (options: FetchOptions) => {
  // نجلب لوجات الحدث خلال نافذة اليوم
  const logs = await options.getLogs({
    target: CONTRACT,
    eventAbi: PARTICIPATED_EVENT,
  });

  // عدد المشاركات خلال الفترة
  const count = BigInt(logs.length);

  // الرسوم الكليّة = عدد المشاركات × الرسم الثابت (بالـ wei)
  const totalFeesWei = count * FEE_PER_PARTICIPATION_WEI;

  // balances helper لتجميع وتحويل العملة لاحقاً
  const balances = options.createBalances();

  // نضيفها كـ Gas Token (ETH على Optimism)
  // ملاحظة: هذا لا يحتاج Indexer، مجرد تجميع قيمة
  balances.addGasToken(totalFeesWei);

  // نفترض أن كل الرسوم تؤول للبروتوكول (عدّل إن كان لديك توزيع آخر)
  return {
    dailyFees: balances,
    dailyRevenue: balances,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OPTIMISM],
  // ضع تاريخ بدء منطقي (أول يوم بدأت تحصيل فيه الرسوم)
  start: "2025-07-21",
  methodology: {
    Fees:
      "عدد أحداث `Participated` خلال اليوم مضروبًا برسم ثابت لكل مشاركة (بالـ ETH). لا يعتمد على Indexer.",
    Revenue:
      "نعتبر 100% من الرسوم تؤول للتريجري. عدّل إذا كان هناك توزيع لحاملي التوكن/LPs.",
  },
};

export default adapter;
