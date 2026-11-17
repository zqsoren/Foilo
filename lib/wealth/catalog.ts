import source from "./catalog-source.json";

export const groups = [
  "资金账户",
  "信用账户",
  "充值账户",
  "理财账户",
  "应收账户",
  "应付账户",
] as const;
const codes = [
  [
    "cash",
    "debit-card",
    "alipay",
    "yuebao",
    "yulibao",
    "xiaohebao",
    "antfortune",
    "wechat",
    "lingqiantong",
    "tencentwealth",
    "qq",
    "douyin",
    "pdd",
    "ecny",
    "jd",
    "jd-xiaojinku",
    "unionpay",
    "paypal",
    "housing-fund",
    "medical",
    "pension",
    "passbook",
    "other-asset",
  ],
  [
    "credit-card",
    "loan",
    "huabei",
    "jd-baitiao",
    "jiebei",
    "meituan-monthly",
    "douyin-monthly",
    "wechat-fenfu",
    "other-credit",
  ],
  [
    "transit",
    "meal",
    "phone",
    "membership",
    "fuel",
    "deposit",
    "other-prepaid",
  ],
  [
    "stock",
    "fund",
    "gold",
    "insurance",
    "futures",
    "crypto",
    "fixed-deposit",
    "other-investment",
  ],
  ["lent", "other-receivable"],
  ["borrowed", "other-payable"],
];
export const categories = {
  cash: "现金与存款",
  fund: "基金",
  stock: "股票",
  gold: "贵金属",
  insurance: "保险现金价值",
  investment: "其他投资",
  prepaid: "预付与押金",
  receivable: "应收款",
  other: "其他资产",
  debt: "负债",
} as const;
export type Category = keyof typeof categories;
export type AccountType = {
  code: string;
  name: string;
  group: number;
  icon: string;
  bank: boolean;
  side: "asset" | "liability";
  category: Category;
};
const originalTypes: AccountType[] = source.flatMap((group, gi) =>
  group.items.map((item, i) => {
    const code = codes[gi][i];
    const debt = gi === 1 || gi === 5;
    const category: Category = debt
      ? "debt"
      : gi === 2
        ? "prepaid"
        : gi === 4
          ? "receivable"
          : gi === 3
            ? ((
                {
                  stock: "stock",
                  fund: "fund",
                  gold: "gold",
                  insurance: "insurance",
                  "fixed-deposit": "cash",
                } as Record<string, Category>
              )[code] ?? "investment")
            : ["yuebao", "yulibao", "lingqiantong", "jd-xiaojinku"].includes(
                  code,
                )
              ? "fund"
              : ["housing-fund", "medical", "pension", "other-asset"].includes(
                    code,
                  )
                ? "other"
                : "cash";
    return {
      code,
      name: item.name,
      group: gi,
      icon: "/folio/assets/icons/" + item.asset,
      bank: code === "debit-card" || code === "credit-card",
      side: debt ? "liability" : "asset",
      category,
    };
  }),
);
const movedPlatforms = ["antfortune", "jd", "tencentwealth"];
export const platformCodes = [
  ...movedPlatforms,
  "ths",
  "eastmoney",
  "ttfund",
  "bocsecurities",
  "pasecurities",
  "sinafinance",
];
export const accountTypes: AccountType[] = [
  ...originalTypes.map((t) =>
    movedPlatforms.includes(t.code)
      ? { ...t, group: 3, category: "investment" as Category }
      : t,
  ),
  ...[
    ["ths", "同花顺"],
    ["eastmoney", "东方财富"],
    ["ttfund", "天天基金"],
    ["bocsecurities", "中银证券"],
    ["pasecurities", "平安证券"],
    ["sinafinance", "新浪财经"],
  ].map(([code, name]) => ({
    code,
    name,
    group: 3,
    icon: `/folio/assets/icons/${code}.png`,
    bank: false,
    side: "asset" as const,
    category: "investment" as Category,
  })),
];
export const defaultAccountNames: Record<string, string> = {
  cash: "现金钱包",
  pension: "养老金",
  medical: "医保卡",
  "housing-fund": "公积金",
};
export function accountName(a: {
  name: string;
  institution: string;
  card_last4: string;
  type_code: string;
}) {
  return typeFor(a.type_code)?.bank && a.institution && a.card_last4
    ? `${a.institution} · 尾号${a.card_last4}`
    : a.name;
}
export function bankIcon(name: string) {
  const codes = [
    "icbc",
    "abc",
    "boc",
    "ccb",
    "bocom",
    "psbc",
    "cmb",
    "citic",
    "spdb",
    "cib",
    "cmbc",
    "ceb",
    "pab",
    "hxb",
    "cgb",
  ];
  const index = banks.indexOf(name);
  return index >= 0 && index < codes.length
    ? `/folio/assets/icons/${codes[index]}.png`
    : typeFor("loan")!.icon;
}
export const currencies = {
  CNY: "人民币",
  USD: "美元",
  JPY: "日元",
  EUR: "欧元",
  GBP: "英镑",
  HKD: "港币",
  AUD: "澳元",
  CAD: "加元",
  CHF: "瑞士法郎",
  SGD: "新加坡元",
  NZD: "新西兰元",
  KRW: "韩元",
} as const;
export type Currency = keyof typeof currencies;
export const banks = [
  "工商银行",
  "农业银行",
  "中国银行",
  "建设银行",
  "交通银行",
  "邮储银行",
  "招商银行",
  "中信银行",
  "浦发银行",
  "兴业银行",
  "民生银行",
  "光大银行",
  "平安银行",
  "华夏银行",
  "广发银行",
  "其他银行",
];
export function typeFor(code: string) {
  return accountTypes.find((t) => t.code === code);
}
export function precision(currency: string) {
  return currency === "JPY" || currency === "KRW" ? 0 : 2;
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
