export interface RedactResult {
  redacted: string;
  mapping: Record<string, string>;
}

const SURNAMES =
  "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤";

const NAME_STOP = new Set([
  "本人", "患者", "病人", "先生", "女士", "同志", "人员", "医师", "医生",
  "正常", "明显", "持续", "主要", "目前", "已经", "需要", "建议", "情况",
  "诊断", "处方", "费用", "金额", "合计", "未知", "暂无", "详见", "男性", "女性",
]);

const PROVINCES =
  "河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆";
const MUNICIPALITIES = "北京|上海|天津|重庆";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ID_CARD_RE =
  /(?<!\d)(?:[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]|[1-9]\d{5}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3})(?!\d)/g;
const BANK_CARD_RE = /(?<!\d)\d{16,19}(?!\d)/g;
const PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ADDRESS_RE = new RegExp(
  `(?:(?:${PROVINCES})(?:省|自治区)?(?:[\\u4e00-\\u9fa5]{2,5}市)?(?:[\\u4e00-\\u9fa5]{2,5}(?:区|县|旗))?|(?:${MUNICIPALITIES})市?(?:[\\u4e00-\\u9fa5]{2,5}(?:区|县))?|(?<=^|[：:\\s，,。；;])[\\u4e00-\\u9fa5]{2,5}(?:市|区|县)(?:[\\u4e00-\\u9fa5]{2,5}(?:区|县))?)[\\u4e00-\\u9fa5A-Za-z0-9-]{1,24}(?:路|街|大道|道|巷|弄|胡同|小区|园|村|镇)[\\u4e00-\\u9fa5A-Za-z0-9-]{0,16}(?:号院?|栋|幢|单元|室|层|楼)(?:[\\u4e00-\\u9fa5A-Za-z0-9-]{0,12}(?:号楼|栋|幢|单元|室|层|楼))*`,
  "g"
);

const LABELED_NAME_RE =
  /(?<=(?:患者姓名|客户姓名|姓名|患者|病人|持卡人|户名|收款人|付款人|联系人|就诊人|申请人|开票人|收件人)[：:]\s*)[\u4e00-\u9fa5]{2,4}(?=[，,。；;、\s\n（(]|$)/g;
const CONTEXT_NAME_RE = new RegExp(
  `(?<=(?:患者|病人|持卡人|联系人))([${SURNAMES}][\\u4e00-\\u9fa5]{1,2})(?=[，,。；;、\\s\\n（(]|$)`,
  "g"
);
const HONORIFIC_NAME_RE = new RegExp(
  `(?<![\\u4e00-\\u9fa5])([${SURNAMES}][\\u4e00-\\u9fa5]{1,2})(?=先生|女士)`,
  "g"
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactText(raw: string): RedactResult {
  const mapping: Record<string, string> = {};
  const counts: Record<string, number> = {};

  const toPlaceholder = (original: string, label: string): string => {
    if (mapping[original]) return mapping[original];
    const next = (counts[label] ?? 0) + 1;
    counts[label] = next;
    const token = next === 1 ? `[${label}]` : `[${label}${next}]`;
    mapping[original] = token;
    return token;
  };

  let text = raw;
  const rules: Array<[RegExp, string]> = [
    [EMAIL_RE, "邮箱"],
    [ID_CARD_RE, "身份证号"],
    [BANK_CARD_RE, "银行卡号"],
    [PHONE_RE, "手机号"],
    [ADDRESS_RE, "地址"],
  ];

  for (const [re, label] of rules) {
    text = text.replace(re, (match) => toPlaceholder(match, label));
  }

  const detectedNames: string[] = [];
  const replaceName = (match: string): string => {
    if (NAME_STOP.has(match)) return match;
    detectedNames.push(match);
    return toPlaceholder(match, "姓名");
  };

  text = text.replace(LABELED_NAME_RE, replaceName);
  text = text.replace(CONTEXT_NAME_RE, (_, name: string) => replaceName(name));
  text = text.replace(HONORIFIC_NAME_RE, (_, name: string) => replaceName(name));

  // Replace any repeated occurrences of already-detected names in the same text.
  for (const name of new Set(detectedNames)) {
    text = text.replace(new RegExp(escapeRegExp(name), "g"), mapping[name]);
  }

  return { redacted: text, mapping };
}

export function restoreText(
  redacted: string,
  mapping: Record<string, string>
): string {
  let restored = redacted;
  const entries = Object.entries(mapping).sort((a, b) => b[1].length - a[1].length);
  for (const [original, placeholder] of entries) {
    restored = restored.replace(new RegExp(escapeRegExp(placeholder), "g"), original);
  }
  return restored;
}
