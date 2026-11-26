export interface RedactResult {
  redacted: string;
  mapping: Record<string, string>;
}

const SURNAMES =
  "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤";
const COMPOUND_SURNAMES =
  "欧阳|司马|上官|诸葛|东方|皇甫|慕容|夏侯|公孙|长孙|司徒|端木|独孤|宇文|南宫|令狐";

const NAME_STOP = new Set([
  "本人", "患者", "病人", "先生", "女士", "同志", "人员", "医师", "医生",
  "正常", "明显", "持续", "主要", "目前", "已经", "需要", "建议", "情况",
  "诊断", "处方", "费用", "金额", "合计", "未知", "暂无", "详见", "男性", "女性",
  "高热", "高烧", "高血压", "高血糖", "高血脂", "黄疸", "白细胞", "白带", "白斑",
  "复诊", "初诊", "主诉", "自诉", "急性", "慢性", "稳定", "良好", "一般",
  "阴性", "阳性", "医保", "自费", "发票", "收据", "报销", "核销",
]);

const ORG_SUFFIX_RE =
  /(?:医院|药房|药店|诊所|卫生院|中心|银行|公司|集团|商城|超市|门店|分店|商店|大学|学院|学校|科室|门诊|内科|外科|儿科|妇科|急诊|药业|医疗|科技|保险)$/;

const PROVINCES =
  "河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆";
const MUNICIPALITIES = "北京|上海|天津|重庆";

const EMAIL_RE =
  /[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;
const ID_CARD_RE =
  /(?<![\dA-Za-z])(?:[1-9]\d{5}[ -]?(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[ -]?\d{3}[\dXx]|[1-9]\d{5}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3})(?![\dA-Za-z])/g;
const BANK_CARD_RE =
  /(?<![\dA-Za-z])(?:\d{4}([ -])\d{4}\1\d{4}\1\d{4}(?:\1\d{1,3}(?![\dA-Za-z元块年月日岁次号室楼栋%]))?|(?:62|4\d|5[1-5])\d{4}[ -]\d{10,13}|\d{16,19})(?![\dA-Za-z])/g;
const PHONE_RE =
  /(?<![\dA-Za-z])(?:\+86[ -]?|86-)?1[3-9]\d(?:([ -])\d{4}\1\d{4}|\d{8})(?![\dA-Za-z])/g;

const ADDR_LABELS =
  "居住地址|家庭住址|家庭地址|联系地址|收件地址|收货地址|通讯地址|详细地址|现住址|户籍地址|住址|地址";
const ROAD_SUFFIX =
  "(?:路|大道|街道|街|巷|弄|胡同|小区|家园|花园|公寓|苑|园|村|镇|(?<![吸化肠食尿气胆阴殖产泪耳声通轨知报说问])道)";
const BLDG_NUM = "[A-Za-z0-9甲乙丙丁东西南北中一二三四五六七八九十负-]";
const ADDR_VERB_STOP = "寄往|发往|送至|位于|居住在|居住|住在|迁至|前往|在|于|至|往";
const ADDRESS_RE = new RegExp(
  `(?:(?:${PROVINCES})(?:省|自治区)? ?(?:[\\u4e00-\\u9fa5]{2,5}市)? ?(?:[\\u4e00-\\u9fa5]{1,6}(?:区|县|旗))? ?|(?:${MUNICIPALITIES})市? ?(?:[\\u4e00-\\u9fa5]{1,6}(?:区|县))? ?|(?<=^|[：:\\s，,。；;]|${ADDR_VERB_STOP})(?!${ADDR_VERB_STOP})[\\u4e00-\\u9fa5]{2,5}(?:市|区|县) ?(?:[\\u4e00-\\u9fa5]{2,5}(?:区|县))? ?|(?<=(?:${ADDR_LABELS})[：:]\\s*))[\\u4e00-\\u9fa5A-Za-z0-9-]{1,24}${ROAD_SUFFIX}[\\u4e00-\\u9fa5A-Za-z0-9-]{0,16}(?:号院?|号楼|栋|幢|座|单元|室|层|楼|户)(?:[\\u4e00-\\u9fa5A-Za-z0-9-]{0,8}(?:号楼|号院|栋|幢|座|单元|室|层|楼|户)| ${BLDG_NUM}{1,6}(?:号楼|号院|栋|幢|座|单元|室|层|楼|户)| ?${BLDG_NUM}{1,6}号)*`,
  "g"
);

const NAME_LABELS =
  "患者姓名|客户姓名|姓名|患者|病人|持卡人|户名|收款人|付款人|紧急联系人|联系人|就诊人|申请人|开票人|收件人|收货人|寄件人|报销人|参保人|被保险人|被保人|投保人|体检人|受检人|经办人|交款人|缴款人|领款人|签收人|开户人|监护人|家属";
const NAME_CORE = `(?:(?:${COMPOUND_SURNAMES})[\\u4e00-\\u9fa5]{1,2}|[${SURNAMES}][\\u4e00-\\u9fa5]{1,2})`;
const LABELED_NAME_RE = new RegExp(
  `(?<=(?:${NAME_LABELS})[：:]\\s*)[\\u4e00-\\u9fa5]{2,4}(?:[·•][\\u4e00-\\u9fa5]{1,4})?(?=[，,。；;、\\s\\n（()）\\[/|]|$)`,
  "g"
);
const CONTEXT_NAME_RE = new RegExp(
  `(?<=(?:患者|病人|持卡人|联系人|就诊人|收件人|申请人|报销人|参保人|被保险人|投保人)\\s*)(${NAME_CORE})(?=[，,。；;、\\s\\n（()）\\[/|]|(?:主诉|自诉|因|在|于(?=\\d)|男(?=\\d|性)|女(?=\\d|性))|$)`,
  "g"
);
const HONORIFIC_NAME_RE = new RegExp(
  `(?<=^|[^\\u4e00-\\u9fa5]|联系|通知|致电|患者|病人|客户)(${NAME_CORE})(?=先生|女士)`,
  "g"
);
const SURNAME_HONORIFIC_RE = new RegExp(
  `(?<=^|[^\\u4e00-\\u9fa5]|联系|通知|致电|患者|病人|客户)((?:${COMPOUND_SURNAMES}|[${SURNAMES}])(?:先生|女士))`,
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
  const replaceName = (match: string, propagate = true): string => {
    if (NAME_STOP.has(match) || ORG_SUFFIX_RE.test(match)) return match;
    if (propagate && match.length >= 2) detectedNames.push(match);
    return toPlaceholder(match, "姓名");
  };

  text = text.replace(LABELED_NAME_RE, (m) => replaceName(m));
  text = text.replace(CONTEXT_NAME_RE, (_, name: string) => replaceName(name));
  text = text.replace(HONORIFIC_NAME_RE, (_, name: string) => replaceName(name));
  text = text.replace(SURNAME_HONORIFIC_RE, (_, token: string) =>
    replaceName(token, false)
  );

  // Replace any repeated occurrences of already-detected names (longest first).
  const uniqueNames = [...new Set(detectedNames)].sort((a, b) => b.length - a.length);
  for (const name of uniqueNames) {
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
