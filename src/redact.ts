export interface RedactResult {
  redacted: string;
  mapping: Record<string, string>;
  latencyMs: number;
}

export interface RedactSessionState {
  mapping: Record<string, string>;
  counts: Record<string, number>;
  knownNames: Set<string>;
}

export function createRedactSession(): RedactSessionState {
  return {
    mapping: {},
    counts: {},
    knownNames: new Set(),
  };
}

const SURNAMES =
  "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤";
const COMPOUND_SURNAMES =
  "欧阳|司马|上官|诸葛|东方|皇甫|慕容|夏侯|公孙|长孙|司徒|端木|独孤|宇文|南宫|令狐";

const NAME_STOP = new Set([
  // Roles & kinship
  "本人", "患者", "病人", "先生", "女士", "同志", "人员", "医师", "医生",
  "父亲", "母亲", "爸爸", "妈妈", "配偶", "丈夫", "妻子", "儿子", "女儿",
  "子女", "家属", "亲属", "监护人", "同事", "朋友", "客户",
  // Payment / admin actions & nouns
  "付费", "付款", "缴费", "自付", "结算", "挂号", "报销", "核销", "支付",
  "消费", "购买", "开具", "领取", "提交", "申请", "办理", "发票", "收据",
  "医保", "自费", "农合", "现金", "刷卡", "扫码", "费用", "金额", "合计",
  "未知", "暂无", "详见", "男性", "女性", "姓名", "性别", "年龄", "单位",
  // Clinical terms & common verbs/adjectives
  "正常", "明显", "持续", "主要", "目前", "已经", "需要", "建议", "情况",
  "诊断", "处方", "高热", "高烧", "高血压", "高血糖", "高血脂", "黄疸",
  "白细胞", "白带", "白斑", "复诊", "初诊", "主诉", "自诉", "急性", "慢性",
  "稳定", "良好", "一般", "阴性", "阳性", "反复", "既往", "近来", "近日",
  "今日", "昨日", "日前", "多次", "多年", "多日", "否认", "常规", "常有",
  "长期", "经常", "口服", "自服", "静滴", "同意", "拒绝", "要求", "满意",
  "配合", "清楚", "清醒", "欠佳", "稍差", "加重", "缓解", "好转", "痊愈",
  "未见", "伴随", "伴有", "出现", "发生", "发现", "引起", "导致", "进行",
  "接受", "完成", "出院", "入院", "住院", "门诊", "复查", "随访", "治疗",
  "用药", "取药", "病情", "病史", "病理", "症状", "体征", "检查", "检验",
  "结果", "方面", "方式", "方案", "金银花",
]);

const ORG_SUFFIX_RE =
  /(?:医院|药房|药店|诊所|卫生院|中心|银行|公司|集团|商城|超市|门店|分店|商店|大学|学院|学校|科室|门诊|内科|外科|儿科|妇科|急诊|药业|医疗|科技|保险)$/;

const ORG_PROTECT_SUFFIXES =
  "人民医院|中心医院|中医院|附属医院|专科医院|医院|大药房|药房|药店|诊所|卫生院|卫生服务中心|医疗中心|体检中心|康复中心|检验中心|疾控中心|银行|股份有限公司|有限责任公司|有限公司|集团公司|集团|商城|超市|专卖店|分店|门店|药业|医疗科技|科技有限公司|保险公司";
const ORG_TAIL =
  "(?:[\\u4e00-\\u9fa5]{0,8}(?:分店|支行|分行|分院|东院|西院|南院|北院|院区|呼吸内科|消化内科|心血管内科|神经内科|普通外科|内科|外科|儿科|妇产科|妇科|急诊科|急诊|门诊部|门诊|骨科|眼科|皮肤科))?";
const ORG_PROTECT_RE = new RegExp(
  `[\\u4e00-\\u9fa5]{2,20}(?:${ORG_PROTECT_SUFFIXES})${ORG_TAIL}`,
  "g"
);
const ORG_LEADING_STRIP_RE =
  /^(?:[年月日号]|(?:今日|昨日|当日|日前|本次|此次)|(?:就诊|复诊|初诊|体检|购药|消费|刷卡|开药|取药|就职|工作|收治)?(?:于|在|至|到)|前往|入住|转入|转诊至|转院至|位于|来自|属于|系|由|经|向|给|和|与|及)+/;

const PROVINCES =
  "河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆";
const MUNICIPALITIES = "北京|上海|天津|重庆";

const EMAIL_RE =
  /[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}/g;
const ID_CARD_RE =
  /(?<![\dA-Za-z])(?:[1-9]\d{5}[ -]?(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[ -]?\d{3}[\dXx]|[1-9]\d{5}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3})(?![\dA-Za-z])/g;

// Labeled medical / insurance / financial identifiers (run BEFORE bank card rules)
const MEDICAL_NO_RE =
  /(?<=(?:门诊号|住院号|病历号|病案号|就诊卡号|诊疗卡号|Medical Record(?:\s*No\.?|#)?|MRN)[：:]\s*)[A-Za-z0-9-]{4,24}(?![\dA-Za-z])/gi;
const INSURANCE_NO_RE =
  /(?<=(?:医保卡号|医保编号|医保号|社保卡号|社保号|社会保障号|Insurance(?:\s*ID|#)?)[：:]\s*)[A-Za-z0-9-]{6,24}(?![\dA-Za-z])/gi;
const PASSPORT_RE =
  /(?<=(?:护照号|护照编号|护照|Passport(?:\s*No\.?)?)[：:]\s*)[A-Za-z][A-Za-z0-9]{7,10}(?![\dA-Za-z])/gi;
const WECHAT_RE =
  /(?<=(?:微信号|微信|WeChat)[：:]\s*)[A-Za-z][A-Za-z0-9_-]{4,23}(?![\dA-Za-z_-])/gi;
const QQ_RE =
  /(?<=(?:QQ号|QQ)[：:]\s*)[1-9]\d{4,11}(?![\dA-Za-z])/gi;
const BIRTH_DATE_RE =
  /(?<=(?:出生日期|出生年月|生日|DOB|Date of Birth)[：:]\s*)(?:19|20)\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2}日?)?/gi;
const ORDER_SERIAL_RE =
  /(?<=(?:交易流水号|银行流水号|支付流水号|流水号|订单号|交易单号|商户单号|发票号码|发票代码|发票号|单据号|凭证号|Order(?:\s*ID|#)?|Invoice(?:\s*No\.?|#)?)[：:]\s*)[A-Za-z0-9-]{8,32}(?![\dA-Za-z])/gi;

// Bank cards: labeled always caught (supports fictional test cards); unlabeled requires valid BIN + Luhn
const LABELED_BANK_CARD_RE =
  /(?<=(?:付款银行卡号|收款银行卡号|银行卡号|银行账号|借记卡号|信用卡号|储蓄卡号|结算卡号|卡号|Card(?:\s*No\.?|#)?)[：:]\s*)(?:\d{4}([ -])\d{4}\1\d{4}\1\d{4}(?:\1\d{1,3})?|\d{6}[ -]\d{10,13}|\d{15,19})(?![\dA-Za-z])/gi;
const UNLABELED_BANK_CARD_RE =
  /(?<![\dA-Za-z])(?:\d{4}([ -])\d{4}\1\d{4}\1\d{4}(?:\1\d{1,3}(?![\dA-Za-z元块年月日岁次号室楼栋%]))?|(?:62|4\d|5[1-5])\d{4}[ -]\d{10,13}|(?:62|4\d|5[1-5])\d{14,17})(?![\dA-Za-z元块年月日岁次号室楼栋%])/g;

// Phones & SSN
const PHONE_RE =
  /(?<![\dA-Za-z])(?:\+86[ -]?|86-)?1[3-9]\d(?:([ -])\d{4}\1\d{4}|\d{8})(?![\dA-Za-z])/g;
const LANDLINE_RE =
  /(?<![\dA-Za-z])0\d{2,3}[- ]\d{7,8}(?:-\d{1,4})?(?![\dA-Za-z])/g;
const LABELED_LANDLINE_RE =
  /(?<=(?:固定电话|固话|座机|联系电话|电话)[：:]\s*)0\d{2,3}\d{7,8}(?![\dA-Za-z])/g;
const US_PHONE_RE =
  /(?<![\dA-Za-z])(?:\+1[-.\s]?)?(?:\(\d{3}\)[-.\s]?|\d{3}[-.])\d{3}[-.]\d{4}(?![\dA-Za-z])/g;
const US_SSN_RE =
  /(?<![\dA-Za-z])\d{3}-\d{2}-\d{4}(?![\dA-Za-z])/g;

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
const EN_LABELED_ADDR_RE =
  /(?<=(?:Address|Home Address|Shipping Address|Billing Address)[：:]\s*)\d{1,6}\s+[A-Za-z0-9.\s#-]+?(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?)(?:,\s*[A-Za-z0-9\s#-]+){0,3}(?=[.;\n]|$)/gi;

const NAME_LABELS =
  "患者姓名|客户姓名|姓名|患者|病人|持卡人|户名|收款人|付款人|紧急联系人|联系人|就诊人|申请人|开票人|收件人|收货人|寄件人|报销人|参保人|被保险人|被保人|投保人|体检人|受检人|经办人|交款人|缴款人|领款人|签收人|签字人|开户人|监护人|家属";
const NAME_CORE = `(?:(?:${COMPOUND_SURNAMES})[\\u4e00-\\u9fa5]{1,2}|[${SURNAMES}][\\u4e00-\\u9fa5]{1,2})`;
const NAME_BEFORE_GENDER_OR_AGE = `(?:(?:${COMPOUND_SURNAMES})(?:[\\u4e00-\\u9fa5][^男女\\d]|[\\u4e00-\\u9fa5])|[${SURNAMES}](?:[\\u4e00-\\u9fa5][^男女\\d]|[\\u4e00-\\u9fa5]))`;
const LABELED_NAME_RE = new RegExp(
  `(?<=(?:${NAME_LABELS})[：:]\\s*)(?:[\\u4e00-\\u9fa5]{2,4}[·•][\\u4e00-\\u9fa5]{1,4}|[\\u4e00-\\u9fa5]{2,4}(?=[，,。；;、\\s\\n（()）\\[/|]|$)|(?:${NAME_BEFORE_GENDER_OR_AGE})(?=男|女|\\d))`,
  "g"
);
const CONTEXT_NAME_RE = new RegExp(
  `(?<=(?:患者|病人|持卡人|联系人|就诊人|收件人|申请人|报销人|参保人|被保险人|投保人)\\s*)(${NAME_CORE})(?=[，,。；;、\\s\\n（()）\\[/|]|(?:主诉|自诉|因|在|于(?=\\d)|男(?=\\d|性)|女(?=\\d|性))|$)`,
  "g"
);
const HONORIFIC_NAME_RE = new RegExp(
  `(?<=^|[^\\u4e00-\\u9fa5]|联系|通知|致电|患者|病人|客户|和|与|及|同|带|陪|向|给|由|找|为)(${NAME_CORE})(?=先生|女士)`,
  "g"
);
const SURNAME_HONORIFIC_RE = new RegExp(
  `(?<=^|[^\\u4e00-\\u9fa5]|联系|通知|致电|患者|病人|客户|和|与|及|同|带|陪|向|给|由|找|为)((?:${COMPOUND_SURNAMES}|[${SURNAMES}])(?:先生|女士))`,
  "g"
);
const EN_LABELED_NAME_RE =
  /(?<=(?:Patient Name|Patient|Cardholder|Account Holder|Recipient|Customer|Contact|Name)[：:]\s*)[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}(?=[,.;\n()\[\]|]|$)/g;

const ADDR_CTX_RE = new RegExp(`(?:${ADDR_LABELS})[：:]\\s*[^，,。；;\\n]*$`);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function passesLuhn(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function redactText(
  raw: string,
  session?: RedactSessionState,
  customTerms?: string[]
): RedactResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const state = session ?? createRedactSession();
  const docMapping: Record<string, string> = {};

  const toPlaceholder = (original: string, label: string): string => {
    let token = state.mapping[original];
    if (!token) {
      const next = (state.counts[label] ?? 0) + 1;
      state.counts[label] = next;
      token = `[${label}${next}]`;
      state.mapping[original] = token;
    }
    docMapping[original] = token;
    return token;
  };

  let text = raw;

  // 0. User-supplied custom sensitive terms (explicit override, longest first)
  if (customTerms && customTerms.length > 0) {
    const cleaned = [...new Set(customTerms.map((t) => t.trim()).filter((t) => t.length >= 2))]
      .sort((a, b) => b.length - a.length);
    if (cleaned.length > 0) {
      const customRe = new RegExp(cleaned.map(escapeRegExp).join("|"), "g");
      text = text.replace(customRe, (m) => toPlaceholder(m, "自定义敏感词"));
    }
  }

  // 1. Protect institution/hospital/pharmacy/company names with sentinels
  const orgSentinels: string[] = [];
  text = text.replace(ORG_PROTECT_RE, (match, offset: number, full: string) => {
    const leadingCtx = full.slice(Math.max(0, offset - 32), offset);
    if (ADDR_CTX_RE.test(leadingCtx)) {
      return match;
    }
    const leadMatch = match.match(ORG_LEADING_STRIP_RE);
    const prefix = leadMatch ? leadMatch[0] : "";
    const org = match.slice(prefix.length);
    if (org.length < 3) return match;
    const idx = orgSentinels.length;
    orgSentinels.push(org);
    return `${prefix}\uE000ORG${idx}\uE001`;
  });

  // 2. Structured PII rules (ordered to prevent misclassification)
  const rules: Array<[RegExp, string]> = [
    [EMAIL_RE, "邮箱"],
    [ID_CARD_RE, "身份证号"],
    [MEDICAL_NO_RE, "病历号"],
    [INSURANCE_NO_RE, "医保号"],
    [PASSPORT_RE, "护照号"],
    [WECHAT_RE, "微信号"],
    [QQ_RE, "QQ号"],
    [BIRTH_DATE_RE, "出生日期"],
    [ORDER_SERIAL_RE, "单号"],
    [LABELED_BANK_CARD_RE, "银行卡号"],
    [PHONE_RE, "手机号"],
    [LANDLINE_RE, "固话"],
    [LABELED_LANDLINE_RE, "固话"],
    [US_SSN_RE, "SSN"],
    [US_PHONE_RE, "电话"],
    [ADDRESS_RE, "地址"],
    [EN_LABELED_ADDR_RE, "地址"],
  ];

  for (const [re, label] of rules) {
    text = text.replace(re, (match) => toPlaceholder(match, label));
  }

  // Unlabeled bank card rule with BIN + Luhn verification
  text = text.replace(UNLABELED_BANK_CARD_RE, (match) => {
    const digits = match.replace(/[ -]/g, "");
    if (digits.length < 16 || digits.length > 19) return match;
    if (!passesLuhn(digits)) return match;
    return toPlaceholder(match, "银行卡号");
  });

  // 3. Name rules (Chinese + labeled English)
  const detectedNames: string[] = [];
  const replaceName = (match: string, propagate = true): string => {
    if (NAME_STOP.has(match) || ORG_SUFFIX_RE.test(match)) return match;
    if (propagate && match.length >= 2) {
      detectedNames.push(match);
      state.knownNames.add(match);
    }
    return toPlaceholder(match, "姓名");
  };

  text = text.replace(LABELED_NAME_RE, (m) => replaceName(m));
  text = text.replace(CONTEXT_NAME_RE, (_, name: string) => replaceName(name));
  text = text.replace(HONORIFIC_NAME_RE, (_, name: string) => replaceName(name));
  text = text.replace(SURNAME_HONORIFIC_RE, (_, token: string) =>
    replaceName(token, false)
  );
  text = text.replace(EN_LABELED_NAME_RE, (m) => replaceName(m));

  // Propagate already-detected names (including across documents in shared session), longest first
  const namesToPropagate = [...new Set([...detectedNames, ...state.knownNames])]
    .sort((a, b) => b.length - a.length);
  for (const name of namesToPropagate) {
    const token = state.mapping[name];
    if (!token) continue;
    const re = new RegExp(escapeRegExp(name), "g");
    if (re.test(text)) {
      text = text.replace(re, token);
      docMapping[name] = token;
    }
  }

  // 4. Restore protected organization names
  if (orgSentinels.length > 0) {
    text = text.replace(/\uE000ORG(\d+)\uE001/g, (_, idx: string) => orgSentinels[Number(idx)] ?? "");
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    redacted: text,
    mapping: docMapping,
    latencyMs: Number((t1 - t0).toFixed(3)),
  };
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
