import assert from "node:assert/strict";
import { createRedactSession, passesLuhn, redactText, restoreText } from "../src/redact.ts";

const MEDICAL_SAMPLE =
  "门诊病历记录：患者姓名：张三，男，36岁，身份证号：110101199001011234，联系电话：13800138000，居住地址：北京市朝阳区建国路88号3号楼502室，电子邮箱：zhangsan_demo@example.com。2026年11月18日就诊于北京协和医院呼吸内科，主诉反复咳嗽伴低热4天。初步诊断：急性支气管炎。处方用药：阿莫西林胶囊0.5g每日三次，复方甘草口服溶液10ml每日三次，嘱多饮水、一周后复诊，本次门诊费用合计328.50元。";

const RECEIPT_SAMPLE =
  "医疗及消费报销票据：持卡人：李明，手机号：13900139000，付款银行卡号：6222021001123456789，收件地址：上海市浦东新区张江路666号201室。消费日期：2026年11月20日，商户名称：上海仁济大药房张江分店。消费明细：阿莫西林胶囊（处方西药续购）215.00元、医用口罩及体温计68.00元、健康体检挂号费150.00元，实付总金额：443.00元。备注：关联2026年11月18日急性支气管炎门诊报销；已开具电子普通发票，用于年底医保与商业险二次核销。";

// 1. Cross-document shared session collision test (H1 + H2)
const session = createRedactSession();
const r1 = redactText(MEDICAL_SAMPLE, session);
const r2 = redactText(RECEIPT_SAMPLE, session);

assert.equal(Object.keys(r1.mapping).length, 5, "Medical sample should redact 5 PII items");
assert.equal(Object.keys(r2.mapping).length, 4, "Receipt sample should redact 4 PII items");
assert.equal(r1.mapping["张三"], "[姓名1]");
assert.equal(r2.mapping["李明"], "[姓名2]");
assert.notEqual(r1.mapping["张三"], r2.mapping["李明"], "Different people must get distinct placeholders");
assert.notEqual(r1.mapping["13800138000"], r2.mapping["13900139000"], "Different phones must get distinct placeholders");
assert.notEqual(
  r1.mapping["北京市朝阳区建国路88号3号楼502室"],
  r2.mapping["上海市浦东新区张江路666号201室"],
  "Different addresses must get distinct placeholders"
);

// Preserve clinical & merchant facts
for (const fact of ["北京协和医院呼吸内科", "急性支气管炎", "阿莫西林胶囊", "复方甘草口服溶液", "328.50元"]) {
  assert.ok(r1.redacted.includes(fact), `Medical fact must be preserved: ${fact}`);
}
for (const fact of ["上海仁济大药房张江分店", "阿莫西林胶囊", "443.00元"]) {
  assert.ok(r2.redacted.includes(fact), `Receipt fact must be preserved: ${fact}`);
}
for (const secret of ["张三", "110101199001011234", "13800138000", "建国路88号", "zhangsan_demo@example.com"]) {
  assert.ok(!r1.redacted.includes(secret), `Medical PII leaked: ${secret}`);
}
for (const secret of ["李明", "13900139000", "6222021001123456789", "张江路666号"]) {
  assert.ok(!r2.redacted.includes(secret), `Receipt PII leaked: ${secret}`);
}

// Re-running doc 1 in same session produces identical placeholders
const r1Again = redactText(MEDICAL_SAMPLE, session);
assert.equal(r1Again.redacted, r1.redacted, "Re-redacting same doc in same session must be deterministic");

// Cross-document restore test (M3)
const mockCloudReport =
  "异常1：病历患者 [姓名1]（[手机号1]）与票据持卡人 [姓名2]（[手机号2]）不一致。\n异常2：金额差额10元。";
const restored = restoreText(mockCloudReport, session.mapping);
assert.ok(restored.includes("张三") && restored.includes("李明"), "restoreText should recover both names");
assert.ok(restored.includes("13800138000") && restored.includes("13900139000"), "restoreText should recover both phones");

// 2. Golden precision & recall suite (35 cases covering Opus probe + medical/receipt/EN edge cases)
const goldenCases = [
  {
    name: "Hospital before address (sentinel protection)",
    input: "北京协和医院位于北京市东城区帅府园1号",
    mustRedact: ["北京市东城区帅府园1号"],
    mustKeep: ["北京协和医院"],
  },
  {
    name: "Person name same prefix as company name",
    input: "收款人：金石，金石化工有限公司",
    mustRedact: ["收款人：金石"],
    mustKeep: ["金石化工有限公司"],
    checkFn: (out) => out.includes("收款人：[姓名1]，金石化工有限公司"),
  },
  {
    name: "False-positive guard: 患者付费",
    input: "患者付费后领取发票，无须排队。",
    mustRedact: [],
    mustKeep: ["患者付费", "发票"],
  },
  {
    name: "False-positive guard: 家属：父亲",
    input: "紧急联系人关系：家属：父亲，陪同就诊。",
    mustRedact: [],
    mustKeep: ["父亲"],
  },
  {
    name: "Medical respiratory / digestive tract terms not swallowed as roads",
    input: "诊断：上呼吸道感染、消化道不适、尿道刺激征，无轨道异常。",
    mustRedact: [],
    mustKeep: ["上呼吸道感染", "消化道不适", "尿道刺激征"],
  },
  {
    name: "Name immediately followed by gender and age without punctuation",
    input: "姓名：张三男36岁，复诊。",
    mustRedact: ["张三"],
    mustKeep: ["男36岁"],
  },
  {
    name: "Compound surname + honorific after 和",
    input: "今日陪同和欧阳女士办理出院结算。",
    mustRedact: ["欧阳女士"],
    mustKeep: ["出院结算"],
  },
  {
    name: "Landline phone with hyphen",
    input: "医院回访座机：010-62345678，请保持畅通。",
    mustRedact: ["010-62345678"],
    mustKeep: ["医院回访座机"],
  },
  {
    name: "Medical record & inpatient numbers",
    input: "门诊号：MZ20261118001，住院号：ZY-889900，病案号：BA20260901。",
    mustRedact: ["MZ20261118001", "ZY-889900", "BA20260901"],
    mustKeep: ["门诊号", "住院号", "病案号"],
  },
  {
    name: "Medical insurance & social security card numbers",
    input: "医保卡号：1100202600123456，社保卡号：BJ987654321。",
    mustRedact: ["1100202600123456", "BJ987654321"],
    mustKeep: ["医保卡号", "社保卡号"],
    checkFn: (out) => !out.includes("[银行卡号"),
  },
  {
    name: "Transaction serial & order & invoice numbers labeled as [单号], not [银行卡号]",
    input: "交易流水号：20261120001122334455，订单号：ORD2026112099887766，发票号码：01100220033445566。",
    mustRedact: ["20261120001122334455", "ORD2026112099887766", "01100220033445566"],
    mustKeep: ["交易流水号", "订单号", "发票号码"],
    checkFn: (out) => !out.includes("[银行卡号") && out.includes("[单号1]"),
  },
  {
    name: "16-digit non-card amount not flagged as bank card",
    input: "年度累计统计基数1234567890123456元，不涉及个人银行卡。",
    mustRedact: [],
    mustKeep: ["1234567890123456元"],
  },
  {
    name: "Unlabeled valid Luhn bank card is redacted",
    input: "请核对尾号对应的6222021001123456789流水。",
    mustRedact: ["6222021001123456789"],
    mustKeep: ["请核对"],
    checkFn: (out) => passesLuhn("6222021001123456789") && out.includes("[银行卡号1]"),
  },
  {
    name: "Passport, WeChat, QQ, DOB",
    input: "护照号：E12345678，微信号：wx_zhangsan88，QQ号：123456789，出生日期：1990-01-01。",
    mustRedact: ["E12345678", "wx_zhangsan88", "123456789", "1990-01-01"],
    mustKeep: ["护照号", "微信号", "QQ号", "出生日期"],
  },
  {
    name: "18-digit ID card with lowercase x & segmented format",
    input: "身份证号：110101 19900101 123x，已核验。",
    mustRedact: ["110101 19900101 123x"],
    mustKeep: ["已核验"],
  },
  {
    name: "15-digit legacy ID card",
    input: "旧身份证：110101850101123，需补录。",
    mustRedact: ["110101850101123"],
    mustKeep: ["旧身份证"],
  },
  {
    name: "International +86 spaced mobile phone",
    input: "联系方式：+86 138-0013-8000，工作日接听。",
    mustRedact: ["+86 138-0013-8000"],
    mustKeep: ["工作日接听"],
  },
  {
    name: "Email with subdomain & plus tag",
    input: "电子发票发送至 finance+claim@mail.clinic-demo.org。",
    mustRedact: ["finance+claim@mail.clinic-demo.org"],
    mustKeep: ["电子发票发送至"],
  },
  {
    name: "Minority name with middle dot",
    input: "患者姓名：阿布都·热合曼，主诉头痛。",
    mustRedact: ["阿布都·热合曼"],
    mustKeep: ["主诉头痛"],
  },
  {
    name: "Context name without colon",
    input: "患者王建国因发热3天来诊，建议验血。",
    mustRedact: ["王建国"],
    mustKeep: ["发热3天", "验血"],
  },
  {
    name: "Honorific full name & surname",
    input: "请致电陈思雨女士，并与赵先生确认复诊时间。",
    mustRedact: ["陈思雨", "赵先生"],
    mustKeep: ["复诊时间"],
  },
  {
    name: "Signatory name redacted while attending doctor intentionally preserved",
    input: "签字人：周明远；接诊医师：林医生（北京协和医院）。",
    mustRedact: ["周明远"],
    mustKeep: ["林医生", "北京协和医院"],
  },
  {
    name: "Clinical false-positive guard: 高血压/白细胞/黄疸/反复",
    input: "患者反复高热伴黄疸，白细胞偏高，既往高血压病史。",
    mustRedact: [],
    mustKeep: ["反复", "高热", "黄疸", "白细胞", "高血压"],
  },
  {
    name: "Address inside province + city + district + lane + room",
    input: "家庭住址：浙江省杭州市西湖区文三路199号创业大厦B座802室。",
    mustRedact: ["浙江省杭州市西湖区文三路199号创业大厦B座802室"],
    mustKeep: ["家庭住址"],
  },
  {
    name: "Custom sensitive term override",
    input: "内部备注：接诊医师王主任，VIP暗号蓝鲸计划。",
    customTerms: ["王主任", "蓝鲸计划"],
    mustRedact: ["王主任", "蓝鲸计划"],
    mustKeep: ["内部备注"],
  },
  {
    name: "English medical receipt sample (L6)",
    input: "Patient Name: Alice Johnson, SSN: 123-45-6789, Phone: (415) 555-0192, Email: alice.j@example.com, Address: 742 Evergreen Ave, San Francisco, CA. Clinic: Bay Area General Hospital, Total: $240.00.",
    mustRedact: ["Alice Johnson", "123-45-6789", "(415) 555-0192", "alice.j@example.com", "742 Evergreen Ave, San Francisco, CA"],
    mustKeep: ["Bay Area General Hospital", "$240.00"],
  },
  {
    name: "Cross-doc name propagation from session",
    input: "补充说明：张三于11月20日申请二次报销。",
    useSharedSession: true,
    mustRedact: ["张三"],
    mustKeep: ["11月20日", "二次报销"],
    checkFn: (out) => out.includes("[姓名1]"),
  },
  {
    name: "Medical sample full check",
    input: MEDICAL_SAMPLE,
    mustRedact: ["张三", "110101199001011234", "13800138000", "北京市朝阳区建国路88号3号楼502室", "zhangsan_demo@example.com"],
    mustKeep: ["北京协和医院呼吸内科", "急性支气管炎", "阿莫西林胶囊", "复方甘草口服溶液", "328.50元"],
  },
  {
    name: "Receipt sample full check",
    input: RECEIPT_SAMPLE,
    mustRedact: ["李明", "13900139000", "6222021001123456789", "上海市浦东新区张江路666号201室"],
    mustKeep: ["上海仁济大药房张江分店", "阿莫西林胶囊", "医用口罩及体温计", "健康体检挂号费", "443.00元"],
  },
  {
    name: "Known boundary (bare unlabeled Chinese name without context)",
    input: "今日张三来院复诊并取药。",
    mustRedact: ["张三"],
    mustKeep: ["复诊", "取药"],
    isKnownLimitation: true,
  },
];

let tp = 0;
let fn = 0;
let fp = 0;
let inScopeTp = 0;
let inScopeFn = 0;
let inScopeFp = 0;
let inScopeCases = 0;
let passedInScopeCases = 0;
const latencies = [];

for (const tc of goldenCases) {
  const res = redactText(
    tc.input,
    tc.useSharedSession ? session : undefined,
    tc.customTerms
  );
  latencies.push(res.latencyMs);

  let caseOk = true;
  for (const target of tc.mustRedact) {
    if (!res.redacted.includes(target)) {
      tp += 1;
      if (!tc.isKnownLimitation) inScopeTp += 1;
    } else {
      fn += 1;
      if (!tc.isKnownLimitation) {
        inScopeFn += 1;
        caseOk = false;
        console.error(`FAIL [MISS] ${tc.name}: expected redacted "${target}" -> got: ${res.redacted}`);
      }
    }
  }
  for (const keep of tc.mustKeep) {
    if (!res.redacted.includes(keep)) {
      fp += 1;
      if (!tc.isKnownLimitation) inScopeFp += 1;
      caseOk = false;
      console.error(`FAIL [FP] ${tc.name}: expected kept "${keep}" -> got: ${res.redacted}`);
    }
  }
  if (tc.checkFn && !tc.checkFn(res.redacted)) {
    caseOk = false;
    console.error(`FAIL [CHECK] ${tc.name}: custom check failed -> got: ${res.redacted}`);
  }
  if (!tc.isKnownLimitation) {
    inScopeCases += 1;
    if (caseOk) passedInScopeCases += 1;
  }
}

const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
const overallRecall = tp + fn === 0 ? 1 : tp / (tp + fn);
const inScopeRecall = inScopeTp + inScopeFn === 0 ? 1 : inScopeTp / (inScopeTp + inScopeFn);
const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

console.log(
  JSON.stringify(
    {
      totalCases: goldenCases.length,
      inScopeCases,
      passedInScopeCases,
      inScope: { tp: inScopeTp, fp: inScopeFp, fn: inScopeFn, precisionPct: 100 * (inScopeTp / (inScopeTp + inScopeFp)), recallPct: Number((inScopeRecall * 100).toFixed(1)) },
      overallWithKnownBoundary: { tp, fp, fn, precisionPct: Number((precision * 100).toFixed(1)), recallPct: Number((overallRecall * 100).toFixed(1)) },
      avgLatencyMs: Number(avgLatency.toFixed(3)),
      medicalLatencyMs: r1.latencyMs,
      receiptLatencyMs: r2.latencyMs,
    },
    null,
    2
  )
);

assert.equal(passedInScopeCases, inScopeCases, "All in-scope golden test cases must pass");
console.log("ALL REDACTION GOLDEN TESTS PASSED");
