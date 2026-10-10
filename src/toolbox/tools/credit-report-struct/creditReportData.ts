// 自动生成自《企业征信报告结构说明（二代 · V5.0）》（信立合创 Excel 规范，全量四层 + 数据项明细 + 代码表）
// 源文档无「报文类型/业务场景」列，业务域按 22 个数据块语义派生。
// 层级关联：块→单元→段→项 全部依「数据项」sheet 的行序上下文推导父子关系（块3位/单元4位/段5位/项7位标签仅作展示，不做前缀关联）。
// 数据项备注中的「码表N/代码表N」引用已解析并挂载对应码表（表号→码值映射）。

export type CreditLevel = 'block' | 'unit' | 'segment' | 'item'

export interface CreditCodeEntry { code: string; name: string; desc: string }
export interface CreditCodeTable { no: string; name: string; entries: CreditCodeEntry[] }
export interface CreditField {
  level: CreditLevel
  tag: string
  name: string
  occurrence: string
  domain: string
  type?: string
  length?: string
  required?: string
  requiredCode?: 'M' | 'O' | 'R' | '?'
  remark?: string
  codeTable?: CreditCodeTable
  children?: CreditField[]
}

export interface CreditDomain { id: string; desc: string }
export interface CreditVersion { version: string; change: string; time: string; note: string }

export const CREDIT_DOMAINS: CreditDomain[] = [
  {
    "id": "报告头与查询",
    "desc": "报告头、查询请求与标识"
  },
  {
    "id": "信用概要",
    "desc": "信用提示与汇总"
  },
  {
    "id": "借贷与担保",
    "desc": "借贷/担保/授信/相关还款责任的汇总与账户"
  },
  {
    "id": "基本信息",
    "desc": "企业身份与基本信息"
  },
  {
    "id": "公用事业",
    "desc": "公用事业缴费账户"
  },
  {
    "id": "公共记录",
    "desc": "欠税/司法/行政/公积金/认证/进出口/融资控制"
  },
  {
    "id": "财务与评级",
    "desc": "财务与评级信息"
  },
  {
    "id": "声明与标注",
    "desc": "声明及标注信息"
  }
]

export const CREDIT_TREE: CreditField[] = [
  {
    "level": "block",
    "tag": "EAA",
    "name": "报告头",
    "occurrence": "[1..1]",
    "domain": "报告头与查询",
    "children": [
      {
        "level": "unit",
        "tag": "EA01",
        "name": "报告头信息单元",
        "occurrence": "[1..1]",
        "domain": "报告头与查询",
        "children": [
          {
            "level": "segment",
            "tag": "EA01A",
            "name": "报告标识信息段",
            "occurrence": "[1..1]",
            "domain": "报告头与查询",
            "children": [
              {
                "level": "item",
                "tag": "EA01AI01",
                "name": "报告编号",
                "occurrence": "[1..1]",
                "type": "N22",
                "length": "22",
                "required": "必含",
                "requiredCode": "M",
                "remark": "标识一份企业信用报告的唯一编码，由查询日期和查询顺序号组成。",
                "domain": "报告头与查询",
                "children": []
              },
              {
                "level": "item",
                "tag": "EA01AR01",
                "name": "报告生成时间",
                "occurrence": "[1..1]",
                "type": "Time",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "生成企业信用报告的时间。",
                "domain": "报告头与查询",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EA01B",
            "name": "查询请求信息段",
            "occurrence": "[1..1]",
            "domain": "报告头与查询",
            "children": [
              {
                "level": "item",
                "tag": "EA01BI01",
                "name": "查询机构代码",
                "occurrence": "[1..1]",
                "type": "AN14",
                "length": "14",
                "required": "必含",
                "requiredCode": "M",
                "remark": "发起本次查询请求的机构在征信系统中的身份编码。",
                "domain": "报告头与查询",
                "children": []
              },
              {
                "level": "item",
                "tag": "EA01BD02",
                "name": "查询原因",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表4",
                "domain": "报告头与查询",
                "codeTable": {
                  "no": "4",
                  "name": "查询原因代码表",
                  "entries": [
                    {
                      "code": "01",
                      "name": "贷前（保前）审查",
                      "desc": ""
                    },
                    {
                      "code": "02",
                      "name": "贷中操作",
                      "desc": ""
                    },
                    {
                      "code": "03",
                      "name": "贷后（在保） 管理",
                      "desc": ""
                    },
                    {
                      "code": "04",
                      "name": "其他原因",
                      "desc": ""
                    },
                    {
                      "code": "05",
                      "name": "关联查询",
                      "desc": ""
                    },
                    {
                      "code": "17",
                      "name": "额度审批",
                      "desc": ""
                    },
                    {
                      "code": "18",
                      "name": "担保审查",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EA01C",
            "name": "身份标识信息段",
            "occurrence": "[1..1]",
            "domain": "报告头与查询",
            "children": [
              {
                "level": "item",
                "tag": "EA01CQ01",
                "name": "企业名称",
                "occurrence": "[1..1]",
                "type": "ANC..80",
                "length": "≤80",
                "required": "必含",
                "requiredCode": "M",
                "remark": "被查询企业的名称。",
                "domain": "报告头与查询",
                "children": []
              },
              {
                "level": "item",
                "tag": "EA01CS01",
                "name": "企业身份标识个数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "身份标识的个数。",
                "domain": "报告头与查询",
                "children": []
              },
              {
                "level": "item",
                "tag": "EA01CH",
                "name": "企业身份信息",
                "occurrence": "[0..*]",
                "type": "",
                "length": "—",
                "required": "可重复",
                "requiredCode": "R",
                "remark": "",
                "domain": "报告头与查询",
                "children": []
              },
              {
                "level": "item",
                "tag": "EA01CD01",
                "name": "企业身份标识类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表2",
                "domain": "报告头与查询",
                "codeTable": {
                  "no": "2",
                  "name": "企业身份标识类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "中征码",
                      "desc": "一代中的“原贷款卡编码”对应此代码。"
                    },
                    {
                      "code": "20",
                      "name": "统一社会信用代码",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "组织机构代码",
                      "desc": ""
                    },
                    {
                      "code": "01",
                      "name": "工商注册号",
                      "desc": ""
                    },
                    {
                      "code": "02",
                      "name": "事业单位证书号",
                      "desc": ""
                    },
                    {
                      "code": "03",
                      "name": "社会团体登记号",
                      "desc": ""
                    },
                    {
                      "code": "04",
                      "name": "民办非企业登记号",
                      "desc": ""
                    },
                    {
                      "code": "05",
                      "name": "基金会登记号",
                      "desc": ""
                    },
                    {
                      "code": "06",
                      "name": "宗教证书登记号",
                      "desc": ""
                    },
                    {
                      "code": "11",
                      "name": "机构信用代码",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "纳税人识别号（国税）",
                      "desc": ""
                    },
                    {
                      "code": "42",
                      "name": "纳税人识别号（地税）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EA01CI01",
                "name": "企业身份标识号码",
                "occurrence": "[1..1]",
                "type": "ANC..40",
                "length": "≤40",
                "required": "必含",
                "requiredCode": "M",
                "remark": "被查询企业的身份标识号码。",
                "domain": "报告头与查询",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EA01D",
            "name": "异议提示信息段",
            "occurrence": "[0..1]",
            "domain": "报告头与查询",
            "children": [
              {
                "level": "item",
                "tag": "EA01DS01",
                "name": "异议标注数目",
                "occurrence": "[1..1]",
                "type": "Float（6,2）",
                "length": "浮点",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息报告中异议标注的数量。 ✓ 异议标注数目为“0”时，代表没有正在处理的异议。",
                "domain": "报告头与查询",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EA01E",
            "name": "汇率说明信息段",
            "occurrence": "[0..1]",
            "domain": "报告头与查询",
            "children": [
              {
                "level": "item",
                "tag": "EA01EQ01",
                "name": "美元折人民币汇率",
                "occurrence": "[1..1]",
                "type": "Float（6,2）",
                "length": "浮点",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当前有效的美元折人民币的汇率。",
                "domain": "报告头与查询",
                "children": []
              },
              {
                "level": "item",
                "tag": "EA01ER01",
                "name": "汇率有效日期",
                "occurrence": "[1..1]",
                "type": "Month",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当前汇率的有效日期。",
                "domain": "报告头与查询",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EBA",
    "name": "信用提示信息",
    "occurrence": "[1..1]",
    "domain": "信用概要",
    "children": [
      {
        "level": "unit",
        "tag": "EB01",
        "name": "信用提示信息单元",
        "occurrence": "[1..1]",
        "domain": "信用概要",
        "children": [
          {
            "level": "segment",
            "tag": "EB01A",
            "name": "信贷交易提示信息段",
            "occurrence": "[0..1]",
            "domain": "信用概要",
            "children": [
              {
                "level": "item",
                "tag": "EB01AR01",
                "name": "首次有信贷交易的年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该信息主体首次发生借贷业务或担保业务的年份。 ✓ 对于信息主体没有发生过借贷业务或担保业务，返回空值。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AR02",
                "name": "首次有相关还款责任的年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该信息主体首次为借贷业务或担保业务承担相关还款责任的年份。 ✓ 对于信息主体没有为借贷业务或担保业务承担过相关还款责 任，返回空值。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AS01",
                "name": "发生信贷交易的机构数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "与信息主体之间有借贷交易、担保交易的法人机构数量。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AS02",
                "name": "当前有未结清 信贷交易的机构数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "与信息主体之间的借贷交易、担保交易仍未结清的法人机构数量。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AJ01",
                "name": "借贷交易余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "借贷交易业务的余额。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AJ02",
                "name": "被追偿的借贷交易余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当前未结清的借贷交易中，处于被追偿状态的业务余额汇总（即 C1 类账户的余额汇总）。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AJ03",
                "name": "关注类借贷交易余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "C1 账户以外的其他未结清借贷交易账户中，关注类借款的余额。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AJ04",
                "name": "不良类借贷交易余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "C1 账户以外的其他未结清借贷交易账户中，不良类借款的余额。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AJ05",
                "name": "担保交易余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "担保交易的余额汇总。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AJ06",
                "name": "关注类担保交易余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当前未结清的担保交易账户中关注类交易的余额。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01AJ07",
                "name": "不良类担保交易余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当前未结清的担保交易账户中不良类交易的余额。",
                "domain": "信用概要",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EB01B",
            "name": "非信贷交易及公共信息提示信息段",
            "occurrence": "[0..1]",
            "domain": "信用概要",
            "children": [
              {
                "level": "item",
                "tag": "EB01BS01",
                "name": "非信贷交易账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公用事业缴费账户以及其他后付费业务的账户数汇总。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01BS02",
                "name": "欠税记录条数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "欠税记录的条数。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01BS03",
                "name": "民事判决记录条数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "民事判决记录的条数。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01BS04",
                "name": "强制执行记录条数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "强制执行的记录条数。",
                "domain": "信用概要",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB01BS05",
                "name": "行政处罚记录条数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "行政处罚的记录条数。",
                "domain": "信用概要",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EBB",
    "name": "借贷交易汇总信息",
    "occurrence": "[1..1]",
    "domain": "借贷与担保",
    "children": [
      {
        "level": "unit",
        "tag": "EB02",
        "name": "借贷交易汇总信息单元",
        "occurrence": "[0..1]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "segment",
            "tag": "EB02A",
            "name": "未结清借贷交易汇总信息段",
            "occurrence": "[1..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "EB02AS01",
                "name": "资产处置业务账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "资产处置业务的未结清账户数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AJ01",
                "name": "资产处置业务余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "资产处置业务的余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AR01",
                "name": "最近一次处置日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指最近一次资产处置的日期。 ✓ 当未结清的资产处置业务账户数为“0”时，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AS02",
                "name": "垫款业务账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "垫款业务的未结清账户数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AJ02",
                "name": "垫款业务余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "垫款业务的余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AR02",
                "name": "垫款最近一次还款日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指最近一次归还垫款的日期。 ✓ 当未结清的垫款业务账户数为“0”时，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AJ03",
                "name": "逾期总额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "逾期总额的合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AJ04",
                "name": "逾期本金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "逾期本金的合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AJ05",
                "name": "逾期利息及其他",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "逾期利息及其他的合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AS03",
                "name": "其他借贷交易分类 汇总条目数量",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "其他借贷交易分类汇总条目数量=业务类型数量乘以资产质量分类 数量的值。 此数据项用于标明以下 4 个数据项重复出现的次数。 ✓ 如果此数据项为“0”，则后面的数据项不出现。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AH",
                "name": "其他借贷交易分类汇总信息",
                "occurrence": "[0..20]",
                "type": "",
                "length": "—",
                "required": "[0..20]",
                "requiredCode": "?",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AD01",
                "name": "业务类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表15",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "15",
                  "name": "企业借贷交易业务类型代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "中长期借款",
                      "desc": "对应于借款期限为中期和长期 的 D1 和 R4类账户。"
                    },
                    {
                      "code": "2",
                      "name": "短期借款",
                      "desc": "对应于借款期限为短期的 D1和 R4 类账户。"
                    },
                    {
                      "code": "3",
                      "name": "循环透支",
                      "desc": "对应于 R1 账户。"
                    },
                    {
                      "code": "4",
                      "name": "贴现",
                      "desc": "对应于 D2 账户。"
                    },
                    {
                      "code": "0",
                      "name": "合计",
                      "desc": "中长期借款、短期借款、循环透支和贴现业务的汇总。"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AD02",
                "name": "资产质量分类",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表17",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "17",
                  "name": "资产质量分类代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "正常类",
                      "desc": "五级分类为正常，或五级分类为“未分类”且没有逾期。"
                    },
                    {
                      "code": "2",
                      "name": "关注类",
                      "desc": "五级分类为关注， 或者五级分类为“未分”且逾期不超过90天。"
                    },
                    {
                      "code": "3",
                      "name": "不良类",
                      "desc": "五级分类为次级、可疑、损失、违约， 或五级分类为“未分类”且逾期 90天以上。"
                    },
                    {
                      "code": "0",
                      "name": "合计",
                      "desc": "以上各类的汇总"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AS04",
                "name": "账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该业务类型与资产质量的组合分类下，未结清的账户数的合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02AJ06",
                "name": "余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该业务类型与资产质量的组合分类下，未结清的账户余额合计。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EB02B",
            "name": "已结清借贷交易汇总信息段",
            "occurrence": "[1..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "EB02BS01",
                "name": "资产处置业务账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指已结清的资产处置业务账户数。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BJ01",
                "name": "资产处置业务金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指已结清的资产处置业务的债权金额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BR01",
                "name": "处置完成日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指已结清的资产处置业务的最后一次实际还款日期。 ✓ 如果没有已结清资产处置业务，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BR02",
                "name": "结清日期",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指该垫款业务的结清日期。 ✓ 如果没有垫款业务，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BS02",
                "name": "垫款业务账户数",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指已结清的垫款业务账户数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BJ02",
                "name": "垫款业务金额",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指已结清的垫款业务的垫款金额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BS03",
                "name": "其他借贷交易分类 汇总条目数量",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "其他借贷交易分类汇总条目数量=已结清借贷交易业务类型数量乘 以资产质量分类数量的值。 ✓ 如果此数值为“0”，则后面的数据项不出现。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BH",
                "name": "其他借贷交易分类汇总信息",
                "occurrence": "[0..20]",
                "type": "",
                "length": "—",
                "required": "[0..20]",
                "requiredCode": "?",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BD01",
                "name": "业务类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表15",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "15",
                  "name": "企业借贷交易业务类型代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "中长期借款",
                      "desc": "对应于借款期限为中期和长期 的 D1 和 R4类账户。"
                    },
                    {
                      "code": "2",
                      "name": "短期借款",
                      "desc": "对应于借款期限为短期的 D1和 R4 类账户。"
                    },
                    {
                      "code": "3",
                      "name": "循环透支",
                      "desc": "对应于 R1 账户。"
                    },
                    {
                      "code": "4",
                      "name": "贴现",
                      "desc": "对应于 D2 账户。"
                    },
                    {
                      "code": "0",
                      "name": "合计",
                      "desc": "中长期借款、短期借款、循环透支和贴现业务的汇总。"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BD02",
                "name": "资产质量分类",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表17",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "17",
                  "name": "资产质量分类代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "正常类",
                      "desc": "五级分类为正常，或五级分类为“未分类”且没有逾期。"
                    },
                    {
                      "code": "2",
                      "name": "关注类",
                      "desc": "五级分类为关注， 或者五级分类为“未分”且逾期不超过90天。"
                    },
                    {
                      "code": "3",
                      "name": "不良类",
                      "desc": "五级分类为次级、可疑、损失、违约， 或五级分类为“未分类”且逾期 90天以上。"
                    },
                    {
                      "code": "0",
                      "name": "合计",
                      "desc": "以上各类的汇总"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02BS04",
                "name": "账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该业务类型与资产质量的组合分类下，已结清的账户数的合计。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EB02C",
            "name": "负债历史汇总信息段",
            "occurrence": "[0..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "EB02CS01",
                "name": "月份数",
                "occurrence": "[1..1]",
                "type": "uInt..2",
                "length": "≤2",
                "required": "必含",
                "requiredCode": "M",
                "remark": "用于说明信用报告中包含的历史负债条目数量。（最多 12 条，最少 1 条。）",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CH",
                "name": "负债历史汇总信息",
                "occurrence": "[0..12]",
                "type": "",
                "length": "—",
                "required": "[0..12]",
                "requiredCode": "?",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CR01",
                "name": "月份",
                "occurrence": "[1..1]",
                "type": "Month",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "描述了信息主体近 3 年来各个季度末表内借贷业务余额的变化情况， 反映了年度负债规模的变化趋势。用于标明以下 10 个指标的汇总时 点。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CS02",
                "name": "全部负债账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的全部借贷交易账户数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CJ01",
                "name": "全部负债余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的全部借贷交易账户余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CS03",
                "name": "关注类负债账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的关注类借贷交易账户数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CJ02",
                "name": "关注类负债余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的关注类借贷交易账户余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CS04",
                "name": "不良类负债账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的不良类借贷交易账户数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CJ03",
                "name": "不良类负债余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的不良类借贷交易账户余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CS05",
                "name": "逾期账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的逾期借贷账户数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CJ04",
                "name": "逾期总额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的逾期借贷账户的逾期金额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CS06",
                "name": "逾期本金账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的逾期本金借贷账户数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB02CJ05",
                "name": "逾期本金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体在汇总时点的逾期本金借贷账户的逾期本金合计。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EBC",
    "name": "担保交易汇总信息",
    "occurrence": "[1..1]",
    "domain": "借贷与担保",
    "children": [
      {
        "level": "unit",
        "tag": "EB03",
        "name": "担保交易汇总信息单元",
        "occurrence": "[0..1]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "segment",
            "tag": "EB03A",
            "name": "未结清担保交易汇总信息段",
            "occurrence": "[1..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "EB03AS01",
                "name": "担保交易分类汇总条目数量",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "担保交易分类汇总条目数量=未结清担保交易业务类型的数量乘以资产质量分类数量的值。 ✓ 如果此数据项为“0”，则后面的数据项不出现。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03AH",
                "name": "未结清担保交易汇总信息",
                "occurrence": "[0..16]",
                "type": "",
                "length": "—",
                "required": "[0..16]",
                "requiredCode": "?",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03AD01",
                "name": "业务类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表16",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "16",
                  "name": "企业担保交易业务类型代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "银行承兑汇票",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "信用证",
                      "desc": ""
                    },
                    {
                      "code": "3",
                      "name": "银行保函",
                      "desc": ""
                    },
                    {
                      "code": "9",
                      "name": "其他",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03AD02",
                "name": "资产质量分类",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表17",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "17",
                  "name": "资产质量分类代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "正常类",
                      "desc": "五级分类为正常，或五级分类为“未分类”且没有逾期。"
                    },
                    {
                      "code": "2",
                      "name": "关注类",
                      "desc": "五级分类为关注， 或者五级分类为“未分”且逾期不超过90天。"
                    },
                    {
                      "code": "3",
                      "name": "不良类",
                      "desc": "五级分类为次级、可疑、损失、违约， 或五级分类为“未分类”且逾期 90天以上。"
                    },
                    {
                      "code": "0",
                      "name": "合计",
                      "desc": "以上各类的汇总"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03AS02",
                "name": "账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该业务类型与资产质量的组合分类下，未结清的账户数的合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03AJ01",
                "name": "余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该业务类型与资产质量的组合分类下，未结清的账户余额合计。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EB03B",
            "name": "已结清担保交易汇总信息段",
            "occurrence": "[1..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "EB03BS01",
                "name": "担保交易分类汇总条目数量",
                "occurrence": "[1..1]",
                "type": "uInt..2",
                "length": "≤2",
                "required": "必含",
                "requiredCode": "M",
                "remark": "担保交易分类汇总条目数量=未结清担保交易业务类型的数量乘以资产质量分类数量的值。 ✓ 如果此数据项为“0”，则后面的数据项不出现。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03BH",
                "name": "已结清担保交易汇总信息",
                "occurrence": "[0..16]",
                "type": "",
                "length": "—",
                "required": "[0..16]",
                "requiredCode": "?",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03BD01",
                "name": "业务类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表16",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "16",
                  "name": "企业担保交易业务类型代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "银行承兑汇票",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "信用证",
                      "desc": ""
                    },
                    {
                      "code": "3",
                      "name": "银行保函",
                      "desc": ""
                    },
                    {
                      "code": "9",
                      "name": "其他",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03BD02",
                "name": "资产质量分类",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表17",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "17",
                  "name": "资产质量分类代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "正常类",
                      "desc": "五级分类为正常，或五级分类为“未分类”且没有逾期。"
                    },
                    {
                      "code": "2",
                      "name": "关注类",
                      "desc": "五级分类为关注， 或者五级分类为“未分”且逾期不超过90天。"
                    },
                    {
                      "code": "3",
                      "name": "不良类",
                      "desc": "五级分类为次级、可疑、损失、违约， 或五级分类为“未分类”且逾期 90天以上。"
                    },
                    {
                      "code": "0",
                      "name": "合计",
                      "desc": "以上各类的汇总"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB03BS02",
                "name": "账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该业务类型与资产质量的组合分类下，已结清的账户数的合计。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EBD",
    "name": "授信协议汇总信息",
    "occurrence": "[1..1]",
    "domain": "借贷与担保",
    "children": [
      {
        "level": "unit",
        "tag": "EB04",
        "name": "授信协议汇总信息记录",
        "occurrence": "[0..1]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "item",
            "tag": "EB040J01",
            "name": "非循环信用额度合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指不可循环使用的授信额度合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "EB040J02",
            "name": "已使用的非循环信用额度合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指非循环信用额度已使用部分的合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "EB040J03",
            "name": "剩余可用的非循环额度合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指非循环信用额度剩余可用部分的合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "EB040J04",
            "name": "循环信用额度合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指可循环使用的授信额度合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "EB040J05",
            "name": "已使用的循环信用额度合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指循环信用额度已使用部分的合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "EB040J06",
            "name": "剩余可用的循环额度合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指循环信用额度剩余可用部分的合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "EB040D01",
            "name": "是否包含授信限额",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "0-否（汇总中不包含授信限额的情况） 1-是（汇总中包含授信限额的情况）",
            "domain": "借贷与担保",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EBE",
    "name": "相关还款责任汇总信息",
    "occurrence": "[1..1]",
    "domain": "借贷与担保",
    "children": [
      {
        "level": "unit",
        "tag": "EB05",
        "name": "相关还款责任汇总信息单元",
        "occurrence": "[0..1]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "segment",
            "tag": "EB05A",
            "name": "借贷交易相关还款责任 汇总信息段",
            "occurrence": "[0..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "EB05AS01",
                "name": "还款责任类型数量",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "责任类型的数量。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AH",
                "name": "借贷交易相关还款责任汇总信息",
                "occurrence": "[0..4]",
                "type": "",
                "length": "—",
                "required": "[0..4]",
                "requiredCode": "?",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AD01",
                "name": "责任类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表19",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "19",
                  "name": "相关还款责任类型代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "个人信贷交易共同还款人/共同债务人",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "保证人/反担保人",
                      "desc": ""
                    },
                    {
                      "code": "3",
                      "name": "票据承兑人",
                      "desc": ""
                    },
                    {
                      "code": "4",
                      "name": "应收账款债务人",
                      "desc": ""
                    },
                    {
                      "code": "5",
                      "name": "供应链中核心企业",
                      "desc": ""
                    },
                    {
                      "code": "6",
                      "name": "专业担保机构",
                      "desc": ""
                    },
                    {
                      "code": "9",
                      "name": "其他",
                      "desc": "在相关还款责任汇总信息单元中，“9-其他”对应的是“3-票据承兑人”、“4-应收账款债务人”、“5-供应链核心企业”、“9-其他”情况汇总。"
                    },
                    {
                      "code": "0",
                      "name": "合计",
                      "desc": "对 1、 2、 9 情况的汇总。"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AJ01",
                "name": "被追偿账户的还款责任金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体为其他借款人未结清的 C1 账户承担的还款责 任金额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AS02",
                "name": "被追偿账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他借款人未结清 C1 账户的 数量。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AJ02",
                "name": "被追偿账户余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他借款人 C1 账户的余额合 计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AJ03",
                "name": "其他借贷交易的还款责任金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体为其他借款人未结清的其他借贷交易账户承 担的还款责任金额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AS03",
                "name": "其他借贷交易账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他借款人未结清的其他借 贷交易账户的数量。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AJ04",
                "name": "其他借贷交易账户余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他借款人其他借贷交易账 户的余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AJ05",
                "name": "其他借贷交易账户关注类余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他借款人其他借贷交易账 户的关注类余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05AJ06",
                "name": "其他借贷交易账户不良类余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他借款人其他借贷交易账 户的不良类余额合计。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EB05B",
            "name": "担保交易相关还款责任 汇总信息段",
            "occurrence": "[0..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "EB05BS01",
                "name": "还款责任类型数量",
                "occurrence": "[1..1]",
                "type": "uInt..2",
                "length": "≤2",
                "required": "必含",
                "requiredCode": "M",
                "remark": "责任类型的数量。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05BH",
                "name": "担保交易相关还款责任汇总信息",
                "occurrence": "[0..4]",
                "type": "",
                "length": "—",
                "required": "[0..4]",
                "requiredCode": "?",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05BD01",
                "name": "责任类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表71",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "71",
                  "name": "公用事业业务类型",
                  "entries": [
                    {
                      "code": "00",
                      "name": "电信缴费",
                      "desc": ""
                    },
                    {
                      "code": "01",
                      "name": "电费信息",
                      "desc": ""
                    },
                    {
                      "code": "02",
                      "name": "水费信息",
                      "desc": ""
                    },
                    {
                      "code": "03",
                      "name": "燃气费信息",
                      "desc": ""
                    },
                    {
                      "code": "04",
                      "name": "有线电视收视费",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其它",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05BJ01",
                "name": "还款责任金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体为其他债务人未结清的担保交易承担的还款 责任金额。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05BS02",
                "name": "账户数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他债务人担保交易的账户 数合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05BJ02",
                "name": "余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他债务人担保交易账户的 余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05BJ03",
                "name": "关注类余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他债务人担保交易账户务 的关注类余额合计。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "EB05BJ04",
                "name": "不良类余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该责任类型下，信息主体承担还款责任的其他债务人担保交易账户的 不良类余额合计。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "ECA",
    "name": "基本信息",
    "occurrence": "[1..1]",
    "domain": "基本信息",
    "children": [
      {
        "level": "unit",
        "tag": "EC01",
        "name": "基本概况信息单元",
        "occurrence": "[0..1]",
        "domain": "基本信息",
        "children": [
          {
            "level": "item",
            "tag": "EC010D01",
            "name": "经济类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表68",
            "domain": "基本信息",
            "codeTable": {
              "no": "68",
              "name": "经济类型代码表",
              "entries": [
                {
                  "code": "100",
                  "name": "内资",
                  "desc": ""
                },
                {
                  "code": "110",
                  "name": "国有全资",
                  "desc": ""
                },
                {
                  "code": "120",
                  "name": "集体全资",
                  "desc": ""
                },
                {
                  "code": "130",
                  "name": "股份合作",
                  "desc": ""
                },
                {
                  "code": "140",
                  "name": "联营",
                  "desc": ""
                },
                {
                  "code": "141",
                  "name": "国有联营",
                  "desc": ""
                },
                {
                  "code": "142",
                  "name": "集体联营",
                  "desc": ""
                },
                {
                  "code": "143",
                  "name": "国有与集体联营",
                  "desc": ""
                },
                {
                  "code": "149",
                  "name": "其他联营",
                  "desc": ""
                },
                {
                  "code": "150",
                  "name": "有限责任(公司)",
                  "desc": ""
                },
                {
                  "code": "159",
                  "name": "其他有限责任(公司)",
                  "desc": ""
                },
                {
                  "code": "160",
                  "name": "股份有限(公司)",
                  "desc": ""
                },
                {
                  "code": "170",
                  "name": "私有",
                  "desc": ""
                },
                {
                  "code": "171",
                  "name": "私有独资",
                  "desc": ""
                },
                {
                  "code": "172",
                  "name": "私有合伙",
                  "desc": ""
                },
                {
                  "code": "173",
                  "name": "私营有限责任(公司)",
                  "desc": ""
                },
                {
                  "code": "174",
                  "name": "私营股份有限(公司)",
                  "desc": ""
                },
                {
                  "code": "175",
                  "name": "个体经营",
                  "desc": ""
                },
                {
                  "code": "179",
                  "name": "其他私有",
                  "desc": ""
                },
                {
                  "code": "190",
                  "name": "其他内资",
                  "desc": ""
                },
                {
                  "code": "200",
                  "name": "港、澳、台投资",
                  "desc": ""
                },
                {
                  "code": "210",
                  "name": "内地和港、澳或台合资",
                  "desc": ""
                },
                {
                  "code": "220",
                  "name": "内地和港、澳或台合作",
                  "desc": ""
                },
                {
                  "code": "230",
                  "name": "港、澳或台独资",
                  "desc": ""
                },
                {
                  "code": "240",
                  "name": "港、澳或台投资股份有限(公司)",
                  "desc": ""
                },
                {
                  "code": "290",
                  "name": "其他港澳台投资",
                  "desc": ""
                },
                {
                  "code": "300",
                  "name": "国外投资",
                  "desc": ""
                },
                {
                  "code": "310",
                  "name": "中外合资",
                  "desc": ""
                },
                {
                  "code": "320",
                  "name": "中外合作",
                  "desc": ""
                },
                {
                  "code": "330",
                  "name": "外资",
                  "desc": ""
                },
                {
                  "code": "340",
                  "name": "国外投资股份有限(公司)",
                  "desc": ""
                },
                {
                  "code": "390",
                  "name": "其他国外投资",
                  "desc": ""
                },
                {
                  "code": "900",
                  "name": "其他",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC010D02",
            "name": "组织机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表67",
            "domain": "基本信息",
            "codeTable": {
              "no": "67",
              "name": "组织机构类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "企业",
                  "desc": ""
                },
                {
                  "code": "11",
                  "name": "公司",
                  "desc": ""
                },
                {
                  "code": "13",
                  "name": "非公司制企业法人",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "企业分支机构",
                  "desc": ""
                },
                {
                  "code": "17",
                  "name": "个人独资企业、合伙企业",
                  "desc": ""
                },
                {
                  "code": "19",
                  "name": "其他企业",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "机关",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "中国共产党",
                  "desc": ""
                },
                {
                  "code": "32",
                  "name": "国家权力机关法人",
                  "desc": ""
                },
                {
                  "code": "33",
                  "name": "国家行政机关法人",
                  "desc": ""
                },
                {
                  "code": "34",
                  "name": "国家司法机关法人",
                  "desc": ""
                },
                {
                  "code": "35",
                  "name": "政协组织",
                  "desc": ""
                },
                {
                  "code": "36",
                  "name": "民主党派",
                  "desc": ""
                },
                {
                  "code": "37",
                  "name": "人民解放军、武警部队",
                  "desc": ""
                },
                {
                  "code": "39",
                  "name": "其他机关",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "事业单位",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "事业单位法人",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "事业单位分支、派出机构",
                  "desc": ""
                },
                {
                  "code": "59",
                  "name": "其他事业单位",
                  "desc": ""
                },
                {
                  "code": "7",
                  "name": "社会团体",
                  "desc": ""
                },
                {
                  "code": "71",
                  "name": "社会团体法人",
                  "desc": ""
                },
                {
                  "code": "73",
                  "name": "社会团体分支、代表机构",
                  "desc": ""
                },
                {
                  "code": "79",
                  "name": "其他社会团体",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "其他组织机构",
                  "desc": ""
                },
                {
                  "code": "91",
                  "name": "民办非企业单位",
                  "desc": ""
                },
                {
                  "code": "93",
                  "name": "基金会",
                  "desc": ""
                },
                {
                  "code": "94",
                  "name": "宗教活动场所",
                  "desc": ""
                },
                {
                  "code": "95",
                  "name": "农村村民委员会",
                  "desc": ""
                },
                {
                  "code": "96",
                  "name": "城市居民委员会",
                  "desc": ""
                },
                {
                  "code": "97",
                  "name": "自定义区",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他未列明的组织机构",
                  "desc": ""
                },
                {
                  "code": "A",
                  "name": "个体工商户",
                  "desc": "征信系统补充"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC010D03",
            "name": "企业规模",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表5",
            "domain": "基本信息",
            "codeTable": {
              "no": "5",
              "name": "企业规模代码表",
              "entries": [
                {
                  "code": "2",
                  "name": "大型企业",
                  "desc": "参照工业和信息化部、国家统计局、发展改革委、财政部联合印发的《关于印发中小企业划型标准规定的通知》（工信部联企业〔2011〕 300 号）执行。"
                },
                {
                  "code": "3",
                  "name": "中型企业",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "小型企业",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "微型企业",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "无需划型",
                  "desc": "适用于企业分支机构以及机关、事业单位等无需划分规模的组织。"
                },
                {
                  "code": "X",
                  "name": "未知",
                  "desc": "适用于无法获取规模的企业。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC010D04",
            "name": "所属行业",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表69",
            "domain": "基本信息",
            "codeTable": {
              "no": "69",
              "name": "行业分类代码表",
              "entries": [
                {
                  "code": "参照国标《国民经济行业分类》 （GB/T 4754-2017） ， 细化到小类。 目前正在使用的 最新版本可登陆征信系统网站查询、下载。",
                  "name": "",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC010Q01",
            "name": "登记地址",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "企业在境内的登记注册地址。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC010R01",
            "name": "成立年份",
            "occurrence": "[1..1]",
            "type": "Year",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "机构成立的日期。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC010R02",
            "name": "登记证书有效截止日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "法定登记机关颁发的登记证书上记载的有效期最终到期日。 ✓ 当返回值为“2099-12-31”时，代表“长期有效”。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC010Q02",
            "name": "办公/经营地址",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于境内企业，指企业在境内的办公/经营的所在地； 对于境外企业，统一返回空值。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC010D05",
            "name": "存续状态",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表6",
            "domain": "基本信息",
            "codeTable": {
              "no": "6",
              "name": "存续状态代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "正常营业",
                  "desc": "处于正常经营状态"
                },
                {
                  "code": "2",
                  "name": "注销",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "其他",
                  "desc": ""
                },
                {
                  "code": "X",
                  "name": "未知",
                  "desc": "无法获得企业存续状态的情况"
                }
              ]
            },
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EC02",
        "name": "注册资本及主要出资人信息单元",
        "occurrence": "[0..1]",
        "domain": "基本信息",
        "children": [
          {
            "level": "item",
            "tag": "EC020J01",
            "name": "注册资本（折人民币合计）",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于企业，指注册资本； 对于事业单位、民办非企业，指开办资金； 对于社会团体，指活动资金； 对于基金会，指原始基金数额； 对于合伙企业和个人独资企业，指出资额。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020S01",
            "name": "主要出资人个数",
            "occurrence": "[1..1]",
            "type": "uInt..2",
            "length": "≤2",
            "required": "必含",
            "requiredCode": "M",
            "remark": "持股或出资比例占比 5%以上的自然人和组织机构的个数。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020R01",
            "name": "更新日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "信息在数据源系统中的最近一次更新的日期。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020H",
            "name": "出资人信息",
            "occurrence": "[0..*]",
            "type": "",
            "length": "—",
            "required": "可重复",
            "requiredCode": "R",
            "remark": "",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020D01",
            "name": "出资人类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表7",
            "domain": "基本信息",
            "codeTable": {
              "no": "7",
              "name": "出资人类型代码表",
              "entries": [
                {
                  "code": "10",
                  "name": "股东",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "普通合伙人",
                  "desc": ""
                },
                {
                  "code": "22",
                  "name": "有限合伙人",
                  "desc": ""
                },
                {
                  "code": "30",
                  "name": "个体工商户参与经营者",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020D02",
            "name": "出资人身份类别",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表1",
            "domain": "基本信息",
            "codeTable": {
              "no": "1",
              "name": "身份类别代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "自然人",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "组织机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020Q01",
            "name": "出资人名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于自然人，指姓名。 对于组织机构，指登记注册名称。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020D03",
            "name": "出资人身份标识类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于自然人，指个人证件类型代码，码表3 对于组织机构，指企业身份标识类型，码表2",
            "domain": "基本信息",
            "codeTable": {
              "no": "3",
              "name": "个人证件类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "户口簿",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "护照",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "港澳居民来往内地通行证",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "台湾同胞来往内地通行证",
                  "desc": ""
                },
                {
                  "code": "8",
                  "name": "外国人居留证",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "警官证",
                  "desc": ""
                },
                {
                  "code": "A",
                  "name": "香港身份证",
                  "desc": ""
                },
                {
                  "code": "B",
                  "name": "澳门身份证",
                  "desc": ""
                },
                {
                  "code": "C",
                  "name": "台湾身份证",
                  "desc": ""
                },
                {
                  "code": "X",
                  "name": "其他证件",
                  "desc": ""
                },
                {
                  "code": "10",
                  "name": "身份证",
                  "desc": "居民身份证及其他以公民身份证号为标识的证件。 一代中的“0-身份证”、 “7-临时身份证” 均对应 此代码。"
                },
                {
                  "code": "20",
                  "name": "军人身份证件",
                  "desc": "一代中的“军官证”、“士兵证”均对应此代码。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020I01",
            "name": "出资人身份标识号码",
            "occurrence": "[1..1]",
            "type": "ANC..40",
            "length": "≤40",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于自然人，指个人证件号码。 对于组织机构，指企业身份标识号码。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC020Q02",
            "name": "出资比例",
            "occurrence": "[1..1]",
            "type": "Float（3,2）",
            "length": "浮点",
            "required": "必含",
            "requiredCode": "M",
            "remark": "计量单位“%”。",
            "domain": "基本信息",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EC03",
        "name": "主要组成人员信息单元",
        "occurrence": "[0..1]",
        "domain": "基本信息",
        "children": [
          {
            "level": "item",
            "tag": "EC030S01",
            "name": "主要组成人员个数",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "主要组成人员指企业的法定代表人、董事长、监事长以及高级管理 人员。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC030R01",
            "name": "更新日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "信息在数据源系统中的最近一次更新的日期。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC030H",
            "name": "主要组成人员信息",
            "occurrence": "[0..*]",
            "type": "",
            "length": "—",
            "required": "可重复",
            "requiredCode": "R",
            "remark": "",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC030Q01",
            "name": "姓名",
            "occurrence": "[1..1]",
            "type": "ANC..30",
            "length": "≤30",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于中国人，指中文名； 对于外国人，指英文名。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC030D01",
            "name": "证件类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表3",
            "domain": "基本信息",
            "codeTable": {
              "no": "3",
              "name": "个人证件类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "户口簿",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "护照",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "港澳居民来往内地通行证",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "台湾同胞来往内地通行证",
                  "desc": ""
                },
                {
                  "code": "8",
                  "name": "外国人居留证",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "警官证",
                  "desc": ""
                },
                {
                  "code": "A",
                  "name": "香港身份证",
                  "desc": ""
                },
                {
                  "code": "B",
                  "name": "澳门身份证",
                  "desc": ""
                },
                {
                  "code": "C",
                  "name": "台湾身份证",
                  "desc": ""
                },
                {
                  "code": "X",
                  "name": "其他证件",
                  "desc": ""
                },
                {
                  "code": "10",
                  "name": "身份证",
                  "desc": "居民身份证及其他以公民身份证号为标识的证件。 一代中的“0-身份证”、 “7-临时身份证” 均对应 此代码。"
                },
                {
                  "code": "20",
                  "name": "军人身份证件",
                  "desc": "一代中的“军官证”、“士兵证”均对应此代码。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC030I01",
            "name": "证件号码",
            "occurrence": "[1..1]",
            "type": "ANC..20",
            "length": "≤20",
            "required": "必含",
            "requiredCode": "M",
            "remark": "主要组成人员的证件号码。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC030D02",
            "name": "职位",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表8",
            "domain": "基本信息",
            "codeTable": {
              "no": "8",
              "name": "职位代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "法定代表人/非法人组织负责人",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "总经理/主要负责人",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "财务负责人",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "董事长/执行董事",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "监事长/执行监事",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "其他董事、监事及高级管理人员",
                  "desc": ""
                }
              ]
            },
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EC04",
        "name": "上级机构信息单元",
        "occurrence": "[0..1]",
        "domain": "基本信息",
        "children": [
          {
            "level": "item",
            "tag": "EC040D01",
            "name": "上级机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表9",
            "domain": "基本信息",
            "codeTable": {
              "no": "9",
              "name": "上级机构类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "集团母公司",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "总部机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC040Q01",
            "name": "上级机构名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "上级机构在登记机关依法登记的名称。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC040D02",
            "name": "上级机构身份标识类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表2",
            "domain": "基本信息",
            "codeTable": {
              "no": "2",
              "name": "企业身份标识类型代码表",
              "entries": [
                {
                  "code": "10",
                  "name": "中征码",
                  "desc": "一代中的“原贷款卡编码”对应此代码。"
                },
                {
                  "code": "20",
                  "name": "统一社会信用代码",
                  "desc": ""
                },
                {
                  "code": "30",
                  "name": "组织机构代码",
                  "desc": ""
                },
                {
                  "code": "01",
                  "name": "工商注册号",
                  "desc": ""
                },
                {
                  "code": "02",
                  "name": "事业单位证书号",
                  "desc": ""
                },
                {
                  "code": "03",
                  "name": "社会团体登记号",
                  "desc": ""
                },
                {
                  "code": "04",
                  "name": "民办非企业登记号",
                  "desc": ""
                },
                {
                  "code": "05",
                  "name": "基金会登记号",
                  "desc": ""
                },
                {
                  "code": "06",
                  "name": "宗教证书登记号",
                  "desc": ""
                },
                {
                  "code": "11",
                  "name": "机构信用代码",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "纳税人识别号（国税）",
                  "desc": ""
                },
                {
                  "code": "42",
                  "name": "纳税人识别号（地税）",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC040I01",
            "name": "上级机构身份标识号码",
            "occurrence": "[1..1]",
            "type": "ANC..40",
            "length": "≤40",
            "required": "必含",
            "requiredCode": "M",
            "remark": "上级机构的身份标识项号码。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC040R01",
            "name": "更新日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "信息在数据源系统中的最近一次更新的日期。",
            "domain": "基本信息",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EC05",
        "name": "实际控制人信息单元",
        "occurrence": "[0..1]",
        "domain": "基本信息",
        "children": [
          {
            "level": "item",
            "tag": "EC050S01",
            "name": "实际控制人个数",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "通过投资关系、协议或者其他安排，能够实际支配公司行为的自然 人或者组织机构的个数。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC050R01",
            "name": "更新日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "信息在数据源系统中的最近一次更新的日期。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC050H",
            "name": "实际控制人信息",
            "occurrence": "[0..*]",
            "type": "",
            "length": "—",
            "required": "可重复",
            "requiredCode": "R",
            "remark": "",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC050D01",
            "name": "实际控制人身份类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表1",
            "domain": "基本信息",
            "codeTable": {
              "no": "1",
              "name": "身份类别代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "自然人",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "组织机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC050Q01",
            "name": "实际控制人名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于自然人，指姓名； 对于组织机构，指登记注册名称。",
            "domain": "基本信息",
            "children": []
          },
          {
            "level": "item",
            "tag": "EC050D02",
            "name": "实际控制人身份标识类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于自然人，指个人证件类型代码，码表3 对于组织机构，指企业身份标识类型，码表2",
            "domain": "基本信息",
            "codeTable": {
              "no": "3",
              "name": "个人证件类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "户口簿",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "护照",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "港澳居民来往内地通行证",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "台湾同胞来往内地通行证",
                  "desc": ""
                },
                {
                  "code": "8",
                  "name": "外国人居留证",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "警官证",
                  "desc": ""
                },
                {
                  "code": "A",
                  "name": "香港身份证",
                  "desc": ""
                },
                {
                  "code": "B",
                  "name": "澳门身份证",
                  "desc": ""
                },
                {
                  "code": "C",
                  "name": "台湾身份证",
                  "desc": ""
                },
                {
                  "code": "X",
                  "name": "其他证件",
                  "desc": ""
                },
                {
                  "code": "10",
                  "name": "身份证",
                  "desc": "居民身份证及其他以公民身份证号为标识的证件。 一代中的“0-身份证”、 “7-临时身份证” 均对应 此代码。"
                },
                {
                  "code": "20",
                  "name": "军人身份证件",
                  "desc": "一代中的“军官证”、“士兵证”均对应此代码。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EC050I01",
            "name": "实际控制人身份标识号码",
            "occurrence": "[1..1]",
            "type": "ANC..40",
            "length": "≤40",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于自然人，指个人证件号码； 对于组织机构，指企业身份标识号码。",
            "domain": "基本信息",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EDA",
    "name": "借贷账户信息",
    "occurrence": "[1..1]",
    "domain": "借贷与担保",
    "children": [
      {
        "level": "unit",
        "tag": "ED01",
        "name": "借贷账户信息单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "segment",
            "tag": "ED01A",
            "name": "基本信息段",
            "occurrence": "[1..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "ED01AI01",
                "name": "借贷账户编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "征信系统分配给该账户在本报告中的唯一编号。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD01",
                "name": "账户活动状态",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表10 为已结清时，“担保方式”、“发放形式”、“其他还款保证方式”、“授信协议编号”、基本信息段中的“信息报告日期”的数据项标签返回空值。",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "10",
                  "name": "账户活动状态代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "未结清",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "已结清",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD02",
                "name": "借贷账户类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表11",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "11",
                  "name": "企业借贷账户类型代码表",
                  "entries": [
                    {
                      "code": "D1",
                      "name": "非循环贷账户",
                      "desc": "用于描述授信额度不可循环的借贷业务，包 括一次性放款的非循环贷业务和分次放款的 非循环贷业务。"
                    },
                    {
                      "code": "D2",
                      "name": "贴现账户",
                      "desc": "用来描述票据贴现类业务。"
                    },
                    {
                      "code": "R1",
                      "name": "循环贷账户",
                      "desc": "用于描述循环授信额度下还款统一管理（即 借款人统一还款）的借贷业务，也可用于汇 总报送循环额度下逐笔管理的所有借贷业 务。"
                    },
                    {
                      "code": "R4",
                      "name": "循环额度下分账户",
                      "desc": "用于描述循环授信额度下逐笔管理（即需要 针对每一笔借款分开还款）的借贷业务。"
                    },
                    {
                      "code": "C1",
                      "name": "催收账户",
                      "desc": "用于描述剩余本息处于催收状态（即债权人 要求债务人尽快归还全部借款）的借贷业 务。"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD03",
                "name": "借款期限",
                "occurrence": "[0..1]",
                "type": "Enum",
                "length": "—",
                "required": "选填",
                "requiredCode": "O",
                "remark": "码表20",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "20",
                  "name": "借款期限分类代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "短期",
                      "desc": "借款期限1年以内（含 1年）。"
                    },
                    {
                      "code": "20",
                      "name": "中期",
                      "desc": "借款期限1年以上5年（含）以下。"
                    },
                    {
                      "code": "30",
                      "name": "长期",
                      "desc": "借款期限5年（不含）以上的借款。"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD04",
                "name": "业务管理机构类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AI03",
                "name": "授信协议编号",
                "occurrence": "[0..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "选填",
                "requiredCode": "O",
                "remark": "征信系统为该账户对应的授信协议在本报告中分配的唯一编号，用于关联与账户相关的授信协议。 对于没有账户对应的授信协议或账户已结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD05",
                "name": "借贷业务种类大类",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表22",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "22",
                  "name": "企业借贷业务大类代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "企业债",
                      "desc": ""
                    },
                    {
                      "code": "11",
                      "name": "贷款",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "贸易融资",
                      "desc": ""
                    },
                    {
                      "code": "13",
                      "name": "保理融资",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "融资租赁",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "证券类融资",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "透支",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "票据贴现",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "黄金借贷",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "垫款",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "资产处置",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD06",
                "name": "借贷业务种类细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表23、24、25、26、27、28、29、30、31、32、33",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "23",
                  "name": "企业借贷业务种类细分代码表（企业债）",
                  "entries": [
                    {
                      "code": "10",
                      "name": "非金融企业债务融资工具",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "上市公司债",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "发改委审核发行企业债",
                      "desc": ""
                    },
                    {
                      "code": "90",
                      "name": "其他公司信用债",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AR01",
                "name": "开户日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "对于 D1/R1/R4 类账户，指首次放款日期。 对于 D2 账户，指建立账户的日期。 对于 C1 账户，指接收债权的日期。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD07",
                "name": "币种",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表70",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "70",
                  "name": "币种代码表",
                  "entries": [
                    {
                      "code": "ADP",
                      "name": "安道尔比塞塔",
                      "desc": "参照国标《货币和资金的代码》（GB/T 12406-2008）。"
                    },
                    {
                      "code": "AED",
                      "name": "UAE 迪拉姆",
                      "desc": ""
                    },
                    {
                      "code": "AFA",
                      "name": "阿富汗尼",
                      "desc": ""
                    },
                    {
                      "code": "ALL",
                      "name": "列克",
                      "desc": ""
                    },
                    {
                      "code": "AMD",
                      "name": "亚美尼亚达姆",
                      "desc": ""
                    },
                    {
                      "code": "……",
                      "name": "……",
                      "desc": ""
                    },
                    {
                      "code": "ZWL",
                      "name": "津巴布韦元",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AJ01",
                "name": "借款金额",
                "occurrence": "[0..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "选填",
                "requiredCode": "O",
                "remark": "对于 D1/R4/类账户，指该账户下借款人累计借出的资金总额； 对于 D2 账户，指贴现金额； 对于 C1 账户，指接收的债权金额。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AJ02",
                "name": "信用额度",
                "occurrence": "[0..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "选填",
                "requiredCode": "O",
                "remark": "仅适用于 R1 账户。 指该账户对应的循环授信合同上的循环可用额度。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AR02",
                "name": "到期日期",
                "occurrence": "[0..1]",
                "type": "Date",
                "length": "—",
                "required": "选填",
                "requiredCode": "O",
                "remark": "对于 D1/R4 类账户，指约定的最后还款日期，贷款发生缩期、展期时，本数据项按照实际情况调整； 对于 D2 账户，指贴现到期日； 对于 R1 账户，指信用额度的有效期截止日。 当该数据项为“2099-12-31”时，代表“长期有效”。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD08",
                "name": "担保方式",
                "occurrence": "[0..1]",
                "type": "Enum",
                "length": "—",
                "required": "选填",
                "requiredCode": "O",
                "remark": "码表37",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "37",
                  "name": "（反）担保方式代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "信用/无担保",
                      "desc": "如果账户已结清，返回空值。"
                    },
                    {
                      "code": "1",
                      "name": "保证",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "质押",
                      "desc": ""
                    },
                    {
                      "code": "3",
                      "name": "抵押",
                      "desc": ""
                    },
                    {
                      "code": "4",
                      "name": "组合",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD09",
                "name": "其他还款保证方式",
                "occurrence": "[0..1]",
                "type": "Enum",
                "length": "—",
                "required": "选填",
                "requiredCode": "O",
                "remark": "码表38",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "38",
                  "name": "其他还款保证方式代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "无",
                      "desc": "如果账户已结清，返回空值。"
                    },
                    {
                      "code": "1",
                      "name": "保证金",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "第三方付款承诺",
                      "desc": ""
                    },
                    {
                      "code": "9",
                      "name": "其他",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD10",
                "name": "发放形式",
                "occurrence": "[0..1]",
                "type": "Enum",
                "length": "—",
                "required": "选填",
                "requiredCode": "O",
                "remark": "码表40",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "40",
                  "name": "贷款发放形式代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "新增",
                      "desc": "如果账户已结清，返回空值。"
                    },
                    {
                      "code": "2",
                      "name": "收回再贷",
                      "desc": ""
                    },
                    {
                      "code": "3",
                      "name": "借新还旧",
                      "desc": ""
                    },
                    {
                      "code": "4",
                      "name": "资产重组",
                      "desc": ""
                    },
                    {
                      "code": "5",
                      "name": "其他机构转入",
                      "desc": ""
                    },
                    {
                      "code": "6",
                      "name": "无还本续贷",
                      "desc": ""
                    },
                    {
                      "code": "9",
                      "name": "其他",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AD11",
                "name": "共同借款标识",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表41，适用账户：所有",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "41",
                  "name": "共同借款（共同债务） 标识代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "无共同借款人（债务人）",
                      "desc": ""
                    },
                    {
                      "code": "1",
                      "name": "有共同借款人（债务人），且本报告主体为主借款人（债务人）",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "有共同借款人（债务人） ，且本报告主体为从借款人（债务人）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AR03",
                "name": "关闭日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "对于 D1/R4/C1 类账户，指贷款结清的日期； 对于 D2 账户，指票据贴现或票据承兑的日期； 对于 R1 账户，指额度到期且贷款结清的日期。 如果账户未结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01AR04",
                "name": "信息报告日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "本条信息单元所包含信息内容的有效截止日期。 如果账户已结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "ED01B",
            "name": "还款表现信息段",
            "occurrence": "[1..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "ED01BS01",
                "name": "还款表现记录条数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "该借贷账户自开立以来的还款表现记录条数。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BH",
                "name": "还款表现信息",
                "occurrence": "[0..*]",
                "type": "",
                "length": "—",
                "required": "可重复",
                "requiredCode": "R",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BR01",
                "name": "信息报告日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "本条还款表现记录所包含信息内容的有效截止日 期。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BJ01",
                "name": "余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "对于 D1/R1/R4 类账户，指本金； 对于 D2 账户，指贴现金额； 对于 C1 类账户，指仍需要归还的全部欠款，包含利息。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BR02",
                "name": "余额变化日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指余额发生变化的日期。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BD01",
                "name": "五级分类",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表45",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "45",
                  "name": "五级分类代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "正常",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "关注",
                      "desc": ""
                    },
                    {
                      "code": "3",
                      "name": "次级",
                      "desc": ""
                    },
                    {
                      "code": "4",
                      "name": "可疑",
                      "desc": ""
                    },
                    {
                      "code": "5",
                      "name": "损失",
                      "desc": ""
                    },
                    {
                      "code": "6",
                      "name": "违约",
                      "desc": ""
                    },
                    {
                      "code": "9",
                      "name": "未分类",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BR03",
                "name": "五级分类认定日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "最近一次认定五级分类的日期。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BR04",
                "name": "最近一次实际还款日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "借款人最近一次实际还款的日期。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BJ02",
                "name": "最近一次实际还款总额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "借款人在最近一次实际还款日的还款总额。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BD02",
                "name": "最近一次还款形式",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表42",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "42",
                  "name": "还款形式代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "正常还款",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "担保代偿",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "政策性还款",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "资产重组",
                      "desc": ""
                    },
                    {
                      "code": "32",
                      "name": "减免",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "债权转让",
                      "desc": ""
                    },
                    {
                      "code": "42",
                      "name": "债权置换",
                      "desc": ""
                    },
                    {
                      "code": "43",
                      "name": "资产剥离",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "债转股",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "以资抵债",
                      "desc": ""
                    },
                    {
                      "code": "61",
                      "name": "诉讼追偿",
                      "desc": ""
                    },
                    {
                      "code": "62",
                      "name": "破产清偿",
                      "desc": ""
                    },
                    {
                      "code": "63",
                      "name": "委托处置",
                      "desc": ""
                    },
                    {
                      "code": "71",
                      "name": "强制平仓",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BR05",
                "name": "最近一次约定还款日期",
                "occurrence": "[0..1]",
                "type": "Date",
                "length": "—",
                "required": "选填",
                "requiredCode": "O",
                "remark": "还款计划表中在信息报告日期之前最晚的约定还款 日。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BJ03",
                "name": "最近一次应还总额",
                "occurrence": "[0..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "选填",
                "requiredCode": "O",
                "remark": "按照还款计划表，借款人应在最近一次约定还款日 归还的总额。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BJ04",
                "name": "逾期总额",
                "occurrence": "[0..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "选填",
                "requiredCode": "O",
                "remark": "指截至信息报告日期，当前应还未还的欠款金额合 计，包括本金、利息各项费用等 适用账户：D1/D2/R1/R4",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BJ05",
                "name": "逾期本金",
                "occurrence": "[0..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "选填",
                "requiredCode": "O",
                "remark": "指截至信息报告日期，当前应还未还的欠款本金。 适用账户：D1/D2/R1/R4",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BS02",
                "name": "逾期月数",
                "occurrence": "[0..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "选填",
                "requiredCode": "O",
                "remark": "指截至信息报告日期，逾期持续的月数。 适用账户：D1/D2/R1/R4",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01BS03",
                "name": "剩余还款月数",
                "occurrence": "[0..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "选填",
                "requiredCode": "O",
                "remark": "从当前时点至最晚一笔借据到期日所在月（含）有 多少个月仍需归还欠款。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "ED01C",
            "name": "特定交易信息段",
            "occurrence": "[0..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "ED01CS01",
                "name": "特定交易个数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "特定交易的个数。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01CH",
                "name": "特定交易信息",
                "occurrence": "[0..*]",
                "type": "",
                "length": "—",
                "required": "可重复",
                "requiredCode": "R",
                "remark": "",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01CD01",
                "name": "交易类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表43",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "43",
                  "name": "特定交易类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "展期",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "提前还款",
                      "desc": ""
                    },
                    {
                      "code": "13",
                      "name": "无还本续贷",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01CR01",
                "name": "交易日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指特定交易发生的日期。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01CJ01",
                "name": "交易金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "“特定交易类型”为“展期”时，表示展期金额（通常为展期时的贷款余额）； “特定交易类型”为“提前还款”时，表示提前归还的本金；",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01CS02",
                "name": "到期日期变更月数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "对于展期，指展期延长的月数； 对于提前还款，指提前还款的月数。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED01CQ01",
                "name": "交易明细信息",
                "occurrence": "[1..1]",
                "type": "ANC..200",
                "length": "≤200",
                "required": "必含",
                "requiredCode": "M",
                "remark": "特定交易详细情况的描述。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "ED02",
        "name": "贴现账户分机构汇总信息单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "item",
            "tag": "ED020I01",
            "name": "贴现账户分机构汇总信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统为该条贴现账户分机构汇总信息在本报告中分配的唯一编号。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020D01",
            "name": "业务管理机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "21",
              "name": "业务管理机构类型代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "商业银行",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "村镇银行",
                  "desc": ""
                },
                {
                  "code": "14",
                  "name": "住房储蓄银行",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "外资银行",
                  "desc": ""
                },
                {
                  "code": "16",
                  "name": "财务公司",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "信托公司",
                  "desc": ""
                },
                {
                  "code": "22",
                  "name": "融资租赁公司",
                  "desc": ""
                },
                {
                  "code": "23",
                  "name": "汽车金融公司",
                  "desc": ""
                },
                {
                  "code": "24",
                  "name": "消费金融公司",
                  "desc": ""
                },
                {
                  "code": "25",
                  "name": "贷款公司",
                  "desc": ""
                },
                {
                  "code": "26",
                  "name": "金融资产管理公司",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "证券公司",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "保险公司",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "小额贷款公司",
                  "desc": ""
                },
                {
                  "code": "52",
                  "name": "公积金管理中心",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "融资性担保公司",
                  "desc": ""
                },
                {
                  "code": "54",
                  "name": "保理公司",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020I02",
            "name": "业务管理机构代码",
            "occurrence": "[1..1]",
            "type": "AN4",
            "length": "4",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020D02",
            "name": "业务种类",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表30",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "30",
              "name": "企业借贷业务种类细分代码表（票据贴现）",
              "entries": [
                {
                  "code": "10",
                  "name": "有追索权的银行承兑汇票贴现",
                  "desc": ""
                },
                {
                  "code": "20",
                  "name": "有追索权的商业承兑汇票贴现",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020D03",
            "name": "五级分类",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表45",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "45",
              "name": "五级分类代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "正常",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "关注",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "次级",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "可疑",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "损失",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "违约",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "未分类",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020S01",
            "name": "未结清账户数",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇总的未结清账户数。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020J01",
            "name": "余额合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇总的未结清账户余额合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020J02",
            "name": "逾期总额合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇总的未结清账户逾期总额合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020J03",
            "name": "逾期本金合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇总的未结清账户逾期本金合计。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020S02",
            "name": "已结清账户数",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇总的已结清账户数。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED020J04",
            "name": "已结清账户贴现金额合计",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇总的已结清账户贴现金额合计。",
            "domain": "借贷与担保",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "ED03",
        "name": "欠息信息单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "item",
            "tag": "ED030I01",
            "name": "欠息信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统为该欠息记录在本报告中分配的唯一编号。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED030D01",
            "name": "业务管理机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "21",
              "name": "业务管理机构类型代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "商业银行",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "村镇银行",
                  "desc": ""
                },
                {
                  "code": "14",
                  "name": "住房储蓄银行",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "外资银行",
                  "desc": ""
                },
                {
                  "code": "16",
                  "name": "财务公司",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "信托公司",
                  "desc": ""
                },
                {
                  "code": "22",
                  "name": "融资租赁公司",
                  "desc": ""
                },
                {
                  "code": "23",
                  "name": "汽车金融公司",
                  "desc": ""
                },
                {
                  "code": "24",
                  "name": "消费金融公司",
                  "desc": ""
                },
                {
                  "code": "25",
                  "name": "贷款公司",
                  "desc": ""
                },
                {
                  "code": "26",
                  "name": "金融资产管理公司",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "证券公司",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "保险公司",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "小额贷款公司",
                  "desc": ""
                },
                {
                  "code": "52",
                  "name": "公积金管理中心",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "融资性担保公司",
                  "desc": ""
                },
                {
                  "code": "54",
                  "name": "保理公司",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED030I02",
            "name": "业务管理机构代码",
            "occurrence": "[1..1]",
            "type": "AN4",
            "length": "4",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED030D02",
            "name": "币种",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表70",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "70",
              "name": "币种代码表",
              "entries": [
                {
                  "code": "ADP",
                  "name": "安道尔比塞塔",
                  "desc": "参照国标《货币和资金的代码》（GB/T 12406-2008）。"
                },
                {
                  "code": "AED",
                  "name": "UAE 迪拉姆",
                  "desc": ""
                },
                {
                  "code": "AFA",
                  "name": "阿富汗尼",
                  "desc": ""
                },
                {
                  "code": "ALL",
                  "name": "列克",
                  "desc": ""
                },
                {
                  "code": "AMD",
                  "name": "亚美尼亚达姆",
                  "desc": ""
                },
                {
                  "code": "……",
                  "name": "……",
                  "desc": ""
                },
                {
                  "code": "ZWL",
                  "name": "津巴布韦元",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED030J01",
            "name": "欠息余额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "欠息的余额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED030R01",
            "name": "余额变化日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "欠息余额变化的日期。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED030D03",
            "name": "欠息类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表44",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "44",
              "name": "欠息类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "表内",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "表外",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED030R02",
            "name": "信息报告日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "本条信息单元所包含信息内容的有效截止日期。",
            "domain": "借贷与担保",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EDB",
    "name": "担保账户信息",
    "occurrence": "[1..1]",
    "domain": "借贷与担保",
    "children": [
      {
        "level": "unit",
        "tag": "ED04",
        "name": "担保账户信息明细单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "segment",
            "tag": "ED04A",
            "name": "基本信息段",
            "occurrence": "[1..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "ED04AI01",
                "name": "担保账户编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "征信系统分配给该账户在本报告中的唯一编号。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AD01",
                "name": "担保账户类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表12",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "12",
                  "name": "企业担保账户类型代码表",
                  "entries": [
                    {
                      "code": "G1",
                      "name": "融资担保账户",
                      "desc": "用于描述银行保函、贷款保证保险、融资担 保合同等融资担保工具。"
                    },
                    {
                      "code": "G2",
                      "name": "非融资担保账户",
                      "desc": "用于描述诉讼保全担保、履约担保等非融资 担保工具。"
                    },
                    {
                      "code": "G3",
                      "name": "支付担保账户",
                      "desc": "用于描述银行承兑汇票、信用证等有银行信 用背书的支付工具。"
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AD02",
                "name": "业务管理机构类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AI03",
                "name": "授信协议编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "征信系统为该账户对应的授信协议在本报告中分配的唯一编号，用于关联与账户相关的授信协议。 对于没有账户对应的授信协议或账户已结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AD03",
                "name": "担保交易业务种类细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表34",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "34",
                  "name": "担保业务种类细分代码表",
                  "entries": [
                    {
                      "code": "01",
                      "name": "贷款担保",
                      "desc": "所属业务大类为融资担保，适用于融资性担保公司。"
                    },
                    {
                      "code": "02",
                      "name": "票据承兑担保",
                      "desc": ""
                    },
                    {
                      "code": "03",
                      "name": "贸易融资担保",
                      "desc": ""
                    },
                    {
                      "code": "04",
                      "name": "项目融资担保",
                      "desc": ""
                    },
                    {
                      "code": "05",
                      "name": "信用证融资担保",
                      "desc": ""
                    },
                    {
                      "code": "06",
                      "name": "其他融资性担保",
                      "desc": ""
                    },
                    {
                      "code": "10",
                      "name": "债券发行担保",
                      "desc": ""
                    },
                    {
                      "code": "07",
                      "name": "诉讼保全担保",
                      "desc": "所属业务大类为非融资担保。"
                    },
                    {
                      "code": "08",
                      "name": "履约担保",
                      "desc": ""
                    },
                    {
                      "code": "09",
                      "name": "非融资担保",
                      "desc": ""
                    },
                    {
                      "code": "11",
                      "name": "再担保",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "贷款保证保险",
                      "desc": ""
                    },
                    {
                      "code": "13",
                      "name": "个人消费信用保证保险",
                      "desc": "仅适用于相关还款责任担保账户分机构汇总信息中的业务种类细分。"
                    },
                    {
                      "code": "51",
                      "name": "信用证",
                      "desc": ""
                    },
                    {
                      "code": "61",
                      "name": "银行承兑汇票",
                      "desc": ""
                    },
                    {
                      "code": "62",
                      "name": "商业承兑汇票",
                      "desc": ""
                    },
                    {
                      "code": "71",
                      "name": "融资类银行保函",
                      "desc": ""
                    },
                    {
                      "code": "72",
                      "name": "非融资类银行保函",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AR01",
                "name": "开立日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "指担保交易生效日期。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AD04",
                "name": "币种",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表70",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "70",
                  "name": "币种代码表",
                  "entries": [
                    {
                      "code": "ADP",
                      "name": "安道尔比塞塔",
                      "desc": "参照国标《货币和资金的代码》（GB/T 12406-2008）。"
                    },
                    {
                      "code": "AED",
                      "name": "UAE 迪拉姆",
                      "desc": ""
                    },
                    {
                      "code": "AFA",
                      "name": "阿富汗尼",
                      "desc": ""
                    },
                    {
                      "code": "ALL",
                      "name": "列克",
                      "desc": ""
                    },
                    {
                      "code": "AMD",
                      "name": "亚美尼亚达姆",
                      "desc": ""
                    },
                    {
                      "code": "……",
                      "name": "……",
                      "desc": ""
                    },
                    {
                      "code": "ZWL",
                      "name": "津巴布韦元",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AJ01",
                "name": "金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "对于融资担保，指融资担保合同签订时的融资保证金额； 对于信用证，指信用证开立时银行承诺担保付款的金额； 对于承兑汇票，指承兑汇票票面标识的金额； 对于银行保函，指保函开具时的合同金额； 对于非融资担保，指非融资担保开立时的合同金额； 对于再担保，指再担保合同中签订时约定的由再担保机构承担担保责任的金额； 对于保证保险，指保证保险合同签订时的担保责任金额。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AR02",
                "name": "到期日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "担保合同约定的担保机构承担担保责任期间的终止日期。 对于融资担保，指融资担保合同签订到期日； 对于信用证，指信用证有效日期或付款日期； 对于承兑汇票，指承兑汇票到期日期或付款日期； 对于银行保函，指保函合同到期日； 对于非融资担保，指非融资担保合同到期日； 对于再担保，指再担保合同到期日； 对于保证保险，指保证保险合同到期日。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AD05",
                "name": "反担保方式",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表37",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "37",
                  "name": "（反）担保方式代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "信用/无担保",
                      "desc": "如果账户已结清，返回空值。"
                    },
                    {
                      "code": "1",
                      "name": "保证",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "质押",
                      "desc": ""
                    },
                    {
                      "code": "3",
                      "name": "抵押",
                      "desc": ""
                    },
                    {
                      "code": "4",
                      "name": "组合",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AD06",
                "name": "其他还款保证方式",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表38",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "38",
                  "name": "其他还款保证方式代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "无",
                      "desc": "如果账户已结清，返回空值。"
                    },
                    {
                      "code": "1",
                      "name": "保证金",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "第三方付款承诺",
                      "desc": ""
                    },
                    {
                      "code": "9",
                      "name": "其他",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04AQ01",
                "name": "保证金比例",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "保证金占信用额度的百分比（保证金*100/信用额度），1 代表1%。 采取向下取整的原则，取值为“0”时，代表保证金比例不足 1%；取值为“100”时，代表已全额还款。 如果账户已结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "ED04B",
            "name": "在保责任信息段",
            "occurrence": "[1..1]",
            "domain": "借贷与担保",
            "children": [
              {
                "level": "item",
                "tag": "ED04BR01",
                "name": "信息报告日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "本条信息单元所包含信息内容的有效截止日期。 如果账户已结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04BD01",
                "name": "账户活动状态",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表10 当“账户活动状态”为未结清时，“代偿（垫款）标志”的数据项标签返回空值。 当“账户活动状态”为已结清时，“反担保方式”、“其他还款保证方式”、“保证金比例”、“余额”、“风险敞口”、“信息报告日期”、“授信协议编号”的数据 项标签返回空值。",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "10",
                  "name": "账户活动状态代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "未结清",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "已结清",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04BJ01",
                "name": "余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "担保机构承担的在保责任余额。 对于融资担保，指融资担保合同未履行的融资保证金额； 对于信用证，指信用证开立时银行承诺担保付款的余额； 对于承兑汇票，指承兑汇票未承兑部分的金额； 对于银行保函，指保函履约所剩的余额； 对于非融资担保，指非融资担保未履行的合同金额； 对于再担保，指再担保合同中签订后未履行的金额； 对于保证保险，指保证保险合同签订后未履行的担保责任金额。 如果账户已结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04BD02",
                "name": "五级分类",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表45",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "45",
                  "name": "五级分类代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "正常",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "关注",
                      "desc": ""
                    },
                    {
                      "code": "3",
                      "name": "次级",
                      "desc": ""
                    },
                    {
                      "code": "4",
                      "name": "可疑",
                      "desc": ""
                    },
                    {
                      "code": "5",
                      "name": "损失",
                      "desc": ""
                    },
                    {
                      "code": "6",
                      "name": "违约",
                      "desc": ""
                    },
                    {
                      "code": "9",
                      "name": "未分类",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04BJ02",
                "name": "风险敞口",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "债务人违约行为导致授信机构的可能承受的风险金额。 如果账户已结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04BD03",
                "name": "代偿（垫款）标志",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表13",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "13",
                  "name": "代偿（垫款）标志代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "否",
                      "desc": "如果账户未结清，返回空值。"
                    },
                    {
                      "code": "1",
                      "name": "是",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04BD04",
                "name": "共同债务标识",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表41",
                "domain": "借贷与担保",
                "codeTable": {
                  "no": "41",
                  "name": "共同借款（共同债务） 标识代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "无共同借款人（债务人）",
                      "desc": ""
                    },
                    {
                      "code": "1",
                      "name": "有共同借款人（债务人），且本报告主体为主借款人（债务人）",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "有共同借款人（债务人） ，且本报告主体为从借款人（债务人）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "ED04BR02",
                "name": "关闭日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "合同终止、或发生垫款的日期。 如果账户未结清，返回空值。",
                "domain": "借贷与担保",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "ED05",
        "name": "担保账户分机构汇总信息单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "item",
            "tag": "ED050I01",
            "name": "担保账户分机构汇总信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统为该条汇总信息在本报告中分配的唯一编号。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050D01",
            "name": "业务管理机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "21",
              "name": "业务管理机构类型代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "商业银行",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "村镇银行",
                  "desc": ""
                },
                {
                  "code": "14",
                  "name": "住房储蓄银行",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "外资银行",
                  "desc": ""
                },
                {
                  "code": "16",
                  "name": "财务公司",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "信托公司",
                  "desc": ""
                },
                {
                  "code": "22",
                  "name": "融资租赁公司",
                  "desc": ""
                },
                {
                  "code": "23",
                  "name": "汽车金融公司",
                  "desc": ""
                },
                {
                  "code": "24",
                  "name": "消费金融公司",
                  "desc": ""
                },
                {
                  "code": "25",
                  "name": "贷款公司",
                  "desc": ""
                },
                {
                  "code": "26",
                  "name": "金融资产管理公司",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "证券公司",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "保险公司",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "小额贷款公司",
                  "desc": ""
                },
                {
                  "code": "52",
                  "name": "公积金管理中心",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "融资性担保公司",
                  "desc": ""
                },
                {
                  "code": "54",
                  "name": "保理公司",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050I02",
            "name": "业务管理机构代码",
            "occurrence": "[1..1]",
            "type": "AN4",
            "length": "4",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050D02",
            "name": "担保交易业务种类细分",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表34",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "34",
              "name": "担保业务种类细分代码表",
              "entries": [
                {
                  "code": "01",
                  "name": "贷款担保",
                  "desc": "所属业务大类为融资担保，适用于融资性担保公司。"
                },
                {
                  "code": "02",
                  "name": "票据承兑担保",
                  "desc": ""
                },
                {
                  "code": "03",
                  "name": "贸易融资担保",
                  "desc": ""
                },
                {
                  "code": "04",
                  "name": "项目融资担保",
                  "desc": ""
                },
                {
                  "code": "05",
                  "name": "信用证融资担保",
                  "desc": ""
                },
                {
                  "code": "06",
                  "name": "其他融资性担保",
                  "desc": ""
                },
                {
                  "code": "10",
                  "name": "债券发行担保",
                  "desc": ""
                },
                {
                  "code": "07",
                  "name": "诉讼保全担保",
                  "desc": "所属业务大类为非融资担保。"
                },
                {
                  "code": "08",
                  "name": "履约担保",
                  "desc": ""
                },
                {
                  "code": "09",
                  "name": "非融资担保",
                  "desc": ""
                },
                {
                  "code": "11",
                  "name": "再担保",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "贷款保证保险",
                  "desc": ""
                },
                {
                  "code": "13",
                  "name": "个人消费信用保证保险",
                  "desc": "仅适用于相关还款责任担保账户分机构汇总信息中的业务种类细分。"
                },
                {
                  "code": "51",
                  "name": "信用证",
                  "desc": ""
                },
                {
                  "code": "61",
                  "name": "银行承兑汇票",
                  "desc": ""
                },
                {
                  "code": "62",
                  "name": "商业承兑汇票",
                  "desc": ""
                },
                {
                  "code": "71",
                  "name": "融资类银行保函",
                  "desc": ""
                },
                {
                  "code": "72",
                  "name": "非融资类银行保函",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050D03",
            "name": "五级分类",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表45",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "45",
              "name": "五级分类代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "正常",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "关注",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "次级",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "可疑",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "损失",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "违约",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "未分类",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050S01",
            "name": "未结清账户数",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇 总的未结清账户数量。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050J01",
            "name": "余额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇 总的账户余额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050J02",
            "name": "30 天内到期的余额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于承兑汇票和信用证业务，指按业务管理机构（法人）、 业务种类、五级分类的组合分类汇总的到期日在30天（含） 以内的账户余额。 对于其他业务，该数据项返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050J03",
            "name": "60 天内到期的余额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于承兑汇票和信用证业务，指按业务管理机构（法人）、 业务种类、五级分类的组合分类汇总的到期日在 30 天（不 含）-60 天（含）之间的账户余额。 对于其他业务，该数据项返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050J04",
            "name": "90 天内到期的余额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于承兑汇票和信用证业务，指按业务管理机构（法人）、 业务种类、五级分类的组合分类汇总的到期日在 60 天（不 含）-90 天（含）之间的账户余额。 对于其他业务，该数据项返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050J05",
            "name": "90 天后到期的余额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对于承兑汇票和信用证业务，指按业务管理机构（法人）、业务种类、五级分类的组合分类汇总的到期日在 90 天（不含）以上的账户余额。 对于其他业务，该数据项返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050S02",
            "name": "已结清账户数",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按业务管理机构（法人）、业务种类、五级分类的组合分类汇 总的已结清账户数量。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED050D04",
            "name": "垫款标志",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表13",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "13",
              "name": "代偿（垫款）标志代码表",
              "entries": [
                {
                  "code": "0",
                  "name": "否",
                  "desc": "如果账户未结清，返回空值。"
                },
                {
                  "code": "1",
                  "name": "是",
                  "desc": ""
                }
              ]
            },
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EDC",
    "name": "授信协议信息",
    "occurrence": "[1..1]",
    "domain": "借贷与担保",
    "children": [
      {
        "level": "unit",
        "tag": "ED06",
        "name": "授信协议信息单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "item",
            "tag": "ED060I01",
            "name": "授信协议编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "征信系统分配给该协议在本报告中的唯一编号。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060D01",
            "name": "业务管理机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "21",
              "name": "业务管理机构类型代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "商业银行",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "村镇银行",
                  "desc": ""
                },
                {
                  "code": "14",
                  "name": "住房储蓄银行",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "外资银行",
                  "desc": ""
                },
                {
                  "code": "16",
                  "name": "财务公司",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "信托公司",
                  "desc": ""
                },
                {
                  "code": "22",
                  "name": "融资租赁公司",
                  "desc": ""
                },
                {
                  "code": "23",
                  "name": "汽车金融公司",
                  "desc": ""
                },
                {
                  "code": "24",
                  "name": "消费金融公司",
                  "desc": ""
                },
                {
                  "code": "25",
                  "name": "贷款公司",
                  "desc": ""
                },
                {
                  "code": "26",
                  "name": "金融资产管理公司",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "证券公司",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "保险公司",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "小额贷款公司",
                  "desc": ""
                },
                {
                  "code": "52",
                  "name": "公积金管理中心",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "融资性担保公司",
                  "desc": ""
                },
                {
                  "code": "54",
                  "name": "保理公司",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060I02",
            "name": "业务管理机构代码",
            "occurrence": "[1..1]",
            "type": "AN4",
            "length": "4",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060D02",
            "name": "授信额度类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表39",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "39",
              "name": "授信额度类型代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "贷款",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "贸易融资",
                  "desc": ""
                },
                {
                  "code": "13",
                  "name": "保理融资",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "证券类融资",
                  "desc": ""
                },
                {
                  "code": "16",
                  "name": "透支",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "黄金借贷",
                  "desc": ""
                },
                {
                  "code": "40",
                  "name": "融资租赁",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "信用证额度",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "承兑汇票额度",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060D03",
            "name": "额度循环标志",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表46",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "46",
              "name": "额度循环标志代码表",
              "entries": [
                {
                  "code": "0",
                  "name": "否",
                  "desc": ""
                },
                {
                  "code": "1",
                  "name": "是",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060D04",
            "name": "币种",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表70",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "70",
              "name": "币种代码表",
              "entries": [
                {
                  "code": "ADP",
                  "name": "安道尔比塞塔",
                  "desc": "参照国标《货币和资金的代码》（GB/T 12406-2008）。"
                },
                {
                  "code": "AED",
                  "name": "UAE 迪拉姆",
                  "desc": ""
                },
                {
                  "code": "AFA",
                  "name": "阿富汗尼",
                  "desc": ""
                },
                {
                  "code": "ALL",
                  "name": "列克",
                  "desc": ""
                },
                {
                  "code": "AMD",
                  "name": "亚美尼亚达姆",
                  "desc": ""
                },
                {
                  "code": "……",
                  "name": "……",
                  "desc": ""
                },
                {
                  "code": "ZWL",
                  "name": "津巴布韦元",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060J01",
            "name": "授信额度",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指授信协议中约定的授信额度",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060J04",
            "name": "已用额度",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "截止信息报告日期，授信协议下的已用额度。 ✓ 如果授信协议下没有对应的账户，返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060J03",
            "name": "授信限额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指除具体产品合同约定的授信额度外，存在的限定客户的借款余 额上限。 ✓ 如果没有授信限额的约定，返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060I03",
            "name": "授信限额编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "征信系统为该授信限额在本报告中分配的唯一编号。 ✓ 如果没有授信限额的约定，返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060R01",
            "name": "生效日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "授信协议额度的生效日期。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060R02",
            "name": "终止日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "授信协议额度的到期日期。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED060R03",
            "name": "信息报告日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "本条信息单元所包含信息内容的有效截止日期。",
            "domain": "借贷与担保",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EDD",
    "name": "相关还款责任信息",
    "occurrence": "[1..1]",
    "domain": "借贷与担保",
    "children": [
      {
        "level": "unit",
        "tag": "ED07",
        "name": "相关还款责任借贷账户（不含贴现）信息单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "item",
            "tag": "ED070I01",
            "name": "账户编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "征信系统分配给信息主体承担相关还款责任的个人借贷账户、企业 借贷账户（不含贴现）在本报告中的唯一编号。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D01",
            "name": "主借款人身份类别",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表1",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "1",
              "name": "身份类别代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "自然人",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "组织机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D02",
            "name": "账户类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当主借款人身份类别是“自然人”，码表14 当主借款人身份类别是“组织机构”，码表15",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "14",
              "name": "个人借贷账户类型代码表",
              "entries": [
                {
                  "code": "D1",
                  "name": "非循环贷账户",
                  "desc": "用于描述非循环贷款。按照贷款发放次数，非循环贷款可以分为一次性放款和分次放款。"
                },
                {
                  "code": "R1",
                  "name": "循环贷账户",
                  "desc": "用于描述循环额度下还款统一管理（即每月根据当前累计借款余额计算出一个还款金额通知借款人）的贷款，也可用于汇总报送循环授信额度下逐笔管理的所有贷款。"
                },
                {
                  "code": "R2",
                  "name": "贷记卡账户",
                  "desc": "用于记录借款人使用贷记卡类产品的透支及还款行为。"
                },
                {
                  "code": "R3",
                  "name": "准贷记卡账户",
                  "desc": "用于记录借款人使用准贷记卡类产品的透支及还款行为。"
                },
                {
                  "code": "R4",
                  "name": "循环额度下分账户",
                  "desc": "用于描述循环授信额度下逐笔管理（即需要针对每一笔借款分开归还）的贷款。 特定情形下，应合并报送。"
                },
                {
                  "code": "C1",
                  "name": "催收账户",
                  "desc": "用于描述剩余本息均处于催收状态的借款。 催收账户不再关注与到期和逾期相关的指标。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D03",
            "name": "相关还款责任人类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表19",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "19",
              "name": "相关还款责任类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "个人信贷交易共同还款人/共同债务人",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "保证人/反担保人",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "票据承兑人",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "应收账款债务人",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "供应链中核心企业",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "专业担保机构",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "其他",
                  "desc": "在相关还款责任汇总信息单元中，“9-其他”对应的是“3-票据承兑人”、“4-应收账款债务人”、“5-供应链核心企业”、“9-其他”情况汇总。"
                },
                {
                  "code": "0",
                  "name": "合计",
                  "desc": "对 1、 2、 9 情况的汇总。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D10",
            "name": "币种（相关还款责任金额）",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表70",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "70",
              "name": "币种代码表",
              "entries": [
                {
                  "code": "ADP",
                  "name": "安道尔比塞塔",
                  "desc": "参照国标《货币和资金的代码》（GB/T 12406-2008）。"
                },
                {
                  "code": "AED",
                  "name": "UAE 迪拉姆",
                  "desc": ""
                },
                {
                  "code": "AFA",
                  "name": "阿富汗尼",
                  "desc": ""
                },
                {
                  "code": "ALL",
                  "name": "列克",
                  "desc": ""
                },
                {
                  "code": "AMD",
                  "name": "亚美尼亚达姆",
                  "desc": ""
                },
                {
                  "code": "……",
                  "name": "……",
                  "desc": ""
                },
                {
                  "code": "ZWL",
                  "name": "津巴布韦元",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070J01",
            "name": "相关还款责任金额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "指信息主体为个人/企业承担相关还款责任的金额。 ✓ 当相关还款责任类型为“个人信贷交易共同还款人”，返回 空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D04",
            "name": "业务管理机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "21",
              "name": "业务管理机构类型代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "商业银行",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "村镇银行",
                  "desc": ""
                },
                {
                  "code": "14",
                  "name": "住房储蓄银行",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "外资银行",
                  "desc": ""
                },
                {
                  "code": "16",
                  "name": "财务公司",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "信托公司",
                  "desc": ""
                },
                {
                  "code": "22",
                  "name": "融资租赁公司",
                  "desc": ""
                },
                {
                  "code": "23",
                  "name": "汽车金融公司",
                  "desc": ""
                },
                {
                  "code": "24",
                  "name": "消费金融公司",
                  "desc": ""
                },
                {
                  "code": "25",
                  "name": "贷款公司",
                  "desc": ""
                },
                {
                  "code": "26",
                  "name": "金融资产管理公司",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "证券公司",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "保险公司",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "小额贷款公司",
                  "desc": ""
                },
                {
                  "code": "52",
                  "name": "公积金管理中心",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "融资性担保公司",
                  "desc": ""
                },
                {
                  "code": "54",
                  "name": "保理公司",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070I02",
            "name": "业务管理机构代码",
            "occurrence": "[1..1]",
            "type": "AN4",
            "length": "4",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D05",
            "name": "业务种类",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当主借款人为个人时，码表35 当主借款人为企业时，码表22",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "35",
              "name": "个人借贷业务大类代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "贷款",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "信用卡",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "证券类融资",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "融资租赁",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "资产处置",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "垫款",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D06",
            "name": "业务种类细分",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当主借款人为个人时，码表36 当主借款人为企业时，码表23",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "36",
              "name": "个人借贷业务种类细分代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "个人住房商业贷款",
                  "desc": "所属业务大类为贷款。"
                },
                {
                  "code": "12",
                  "name": "个人商用房（含商住两用） 贷款",
                  "desc": ""
                },
                {
                  "code": "13",
                  "name": "个人住房公积金贷款",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "个人汽车消费贷款",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "个人助学贷款",
                  "desc": ""
                },
                {
                  "code": "32",
                  "name": "国家助学贷款",
                  "desc": ""
                },
                {
                  "code": "33",
                  "name": "商业助学贷款",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "个人经营性贷款",
                  "desc": ""
                },
                {
                  "code": "42",
                  "name": "个人创业担保贷款",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "农户贷款",
                  "desc": ""
                },
                {
                  "code": "52",
                  "name": "经营性农户贷款",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "消费性农户贷款",
                  "desc": ""
                },
                {
                  "code": "91",
                  "name": "其他个人消费贷款",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他贷款",
                  "desc": ""
                },
                {
                  "code": "71",
                  "name": "准贷记卡",
                  "desc": "所属业务大类为信用卡。"
                },
                {
                  "code": "81",
                  "name": "贷记卡",
                  "desc": ""
                },
                {
                  "code": "82",
                  "name": "大额专项分期卡",
                  "desc": ""
                },
                {
                  "code": "61",
                  "name": "约定购回式证券交易",
                  "desc": ""
                },
                {
                  "code": "62",
                  "name": "股票质押式回购交易",
                  "desc": "所属业务大类为证券类融 资。"
                },
                {
                  "code": "63",
                  "name": "融资融券业务",
                  "desc": ""
                },
                {
                  "code": "64",
                  "name": "其他证券类融资",
                  "desc": ""
                },
                {
                  "code": "92",
                  "name": "融资租赁业务",
                  "desc": "所属业务大类为融资租赁。"
                },
                {
                  "code": "A1",
                  "name": "资产处置",
                  "desc": "由资产处置机构催收的债务，所属业务大类为资产处置。"
                },
                {
                  "code": "B1",
                  "name": "代偿债务",
                  "desc": "因代偿继承债权的债务，所属业务大类为垫款。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070R01",
            "name": "开立日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "账户的开立日期。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070R02",
            "name": "到期日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "账户的到期日期。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D07",
            "name": "币种",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表70",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "70",
              "name": "币种代码表",
              "entries": [
                {
                  "code": "ADP",
                  "name": "安道尔比塞塔",
                  "desc": "参照国标《货币和资金的代码》（GB/T 12406-2008）。"
                },
                {
                  "code": "AED",
                  "name": "UAE 迪拉姆",
                  "desc": ""
                },
                {
                  "code": "AFA",
                  "name": "阿富汗尼",
                  "desc": ""
                },
                {
                  "code": "ALL",
                  "name": "列克",
                  "desc": ""
                },
                {
                  "code": "AMD",
                  "name": "亚美尼亚达姆",
                  "desc": ""
                },
                {
                  "code": "……",
                  "name": "……",
                  "desc": ""
                },
                {
                  "code": "ZWL",
                  "name": "津巴布韦元",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070J02",
            "name": "余额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "账户的当前余额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070J05",
            "name": "借款金额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "✓ 对于 R1、R2 和 R3 账户，返回空值； ✓ 对于 D1、 R4 和 C1 账户，指账户的借款金额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070J06",
            "name": "信用额度",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "✓ 对于 D1、R4 和 C1 账户，返回空值； ✓ 对于 R1、R2 和 R3 账户，指账户的信用额度。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070I03",
            "name": "保证合同编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "征信系统为该相关还款责任人对应的保证合同在本报告中分配的 唯一编号。 ✓ 如果没有对应的保证合同，返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D08",
            "name": "五级分类",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表45",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "45",
              "name": "五级分类代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "正常",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "关注",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "次级",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "可疑",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "损失",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "违约",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "未分类",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070J03",
            "name": "逾期总额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "✓ 对于 C1 和 R3 账户，返回空值； ✓ 对于其他账户，指账户当前的逾期总额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070J04",
            "name": "逾期本金",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "✓ 对于 C1、R2、R3 账户，返回空值； ✓ 对于其他账户，指账户当前的逾期本金。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070S01",
            "name": "逾期月数",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "✓ 当主借款人为个人时，返回空值。 ✓ 当主借款人为企业时，指该账户逾期持续的月份数。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070D09",
            "name": "还款状态",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "✓ 对于 C1 账户，返回空值； ✓ 当主借款人为企业时，返回空值； ✓ 对于个人的其他账户，指该账户当前的还款状态，码表47、48、49、50",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "47",
              "name": "个人借贷账户还款状态代码表（D1/R4 账户）",
              "entries": [
                {
                  "code": "*",
                  "name": "当月不需要还款且之前没有拖欠",
                  "desc": ""
                },
                {
                  "code": "N",
                  "name": "正常还款",
                  "desc": "表示借款人已经按时归还该月应还款金额的全部，且该账户没有逾期。"
                },
                {
                  "code": "D",
                  "name": "担保人（第三方）代偿",
                  "desc": "表示借款人当前欠款已由担保人代还，账户当前没有逾期，包括全部由担保人代还与部分由担保人部分代还。"
                },
                {
                  "code": "Z",
                  "name": "以资抵债",
                  "desc": "表示借款人当月的欠款已通过以资抵债的方式还款，账户当前没有逾期。"
                },
                {
                  "code": "M",
                  "name": "约定还款日后月底前还款",
                  "desc": "表示截止信息报告日期，借款人已还清所有逾期款项，但是未能在本月的应还日前还清。"
                },
                {
                  "code": "1",
                  "name": "逾期 1-30 天",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "逾期 31-60 天",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "逾期 61-90 天",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "逾期 91-120 天",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "逾期 121-150 天",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "逾期 151-180 天",
                  "desc": ""
                },
                {
                  "code": "7",
                  "name": "逾期 180 天以上",
                  "desc": ""
                },
                {
                  "code": "B",
                  "name": "呆账",
                  "desc": "长期不还款，具体逾期天数未知。"
                },
                {
                  "code": "C",
                  "name": "结清",
                  "desc": "借款人该笔贷款全部还清，贷款余额为 0。"
                },
                {
                  "code": "G",
                  "name": "结束",
                  "desc": "结清除外，其他形式的债权关系解除，如资产剥离。"
                },
                {
                  "code": "#",
                  "name": "未知",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070S02",
            "name": "剩余还款月数",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "✓ 对于 R1 账户，指从当前时点至最晚一笔借据到期日所在月 （含）之间有多少个月份。 ✓ 对于其他账户，返回空值。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED070R03",
            "name": "信息报告日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "本条信息单元所包含信息内容的有效截止日期。",
            "domain": "借贷与担保",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "ED08",
        "name": "相关还款责任贴现账户分机构汇总信息单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "item",
            "tag": "ED080I01",
            "name": "贴现账户分机构汇总信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "征信系统分配给该条汇总信息在本报告中的唯一编号。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080D01",
            "name": "相关还款责任类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表19",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "19",
              "name": "相关还款责任类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "个人信贷交易共同还款人/共同债务人",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "保证人/反担保人",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "票据承兑人",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "应收账款债务人",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "供应链中核心企业",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "专业担保机构",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "其他",
                  "desc": "在相关还款责任汇总信息单元中，“9-其他”对应的是“3-票据承兑人”、“4-应收账款债务人”、“5-供应链核心企业”、“9-其他”情况汇总。"
                },
                {
                  "code": "0",
                  "name": "合计",
                  "desc": "对 1、 2、 9 情况的汇总。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080D02",
            "name": "业务管理机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "21",
              "name": "业务管理机构类型代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "商业银行",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "村镇银行",
                  "desc": ""
                },
                {
                  "code": "14",
                  "name": "住房储蓄银行",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "外资银行",
                  "desc": ""
                },
                {
                  "code": "16",
                  "name": "财务公司",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "信托公司",
                  "desc": ""
                },
                {
                  "code": "22",
                  "name": "融资租赁公司",
                  "desc": ""
                },
                {
                  "code": "23",
                  "name": "汽车金融公司",
                  "desc": ""
                },
                {
                  "code": "24",
                  "name": "消费金融公司",
                  "desc": ""
                },
                {
                  "code": "25",
                  "name": "贷款公司",
                  "desc": ""
                },
                {
                  "code": "26",
                  "name": "金融资产管理公司",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "证券公司",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "保险公司",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "小额贷款公司",
                  "desc": ""
                },
                {
                  "code": "52",
                  "name": "公积金管理中心",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "融资性担保公司",
                  "desc": ""
                },
                {
                  "code": "54",
                  "name": "保理公司",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080I02",
            "name": "业务管理机构代码",
            "occurrence": "[1..1]",
            "type": "AN4",
            "length": "4",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080D03",
            "name": "业务种类细分",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表30",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "30",
              "name": "企业借贷业务种类细分代码表（票据贴现）",
              "entries": [
                {
                  "code": "10",
                  "name": "有追索权的银行承兑汇票贴现",
                  "desc": ""
                },
                {
                  "code": "20",
                  "name": "有追索权的商业承兑汇票贴现",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080D04",
            "name": "五级分类",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表45",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "45",
              "name": "五级分类代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "正常",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "关注",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "次级",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "可疑",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "损失",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "违约",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "未分类",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080J01",
            "name": "相关还款责任金额",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类、保证合同编号的组合分类汇总的相关还款责任金额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080S01",
            "name": "账户数",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类、保证合同编号的组合分类汇总的未结清贴现账户数。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080J02",
            "name": "余额",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类、保证合同编号的组合分类汇总的贴现账户余额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080J03",
            "name": "逾期总额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类的组合分类汇总的贴现账户逾期总额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080J04",
            "name": "逾期本金",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类的组合分类汇总的贴现账户逾期本金。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080J05",
            "name": "借款金额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类、保证合同编号的组合分类汇总的借款金额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED080I03",
            "name": "保证合同编号",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "征信系统为该相关还款责任人对应的保证合同在本报告中分配的 唯一编号。 ✓ 如果没有对应的保证合同，返回空值。",
            "domain": "借贷与担保",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "ED09",
        "name": "相关还款责任担保账户分机构汇总信息单元",
        "occurrence": "[0..*]",
        "domain": "借贷与担保",
        "children": [
          {
            "level": "item",
            "tag": "ED090I01",
            "name": "担保账户分机构汇总信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "征信系统分配给该条汇总信息在本报告中的唯一编号。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090D01",
            "name": "相关还款责任类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表19",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "19",
              "name": "相关还款责任类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "个人信贷交易共同还款人/共同债务人",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "保证人/反担保人",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "票据承兑人",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "应收账款债务人",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "供应链中核心企业",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "专业担保机构",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "其他",
                  "desc": "在相关还款责任汇总信息单元中，“9-其他”对应的是“3-票据承兑人”、“4-应收账款债务人”、“5-供应链核心企业”、“9-其他”情况汇总。"
                },
                {
                  "code": "0",
                  "name": "合计",
                  "desc": "对 1、 2、 9 情况的汇总。"
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090D02",
            "name": "业务管理机构类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "21",
              "name": "业务管理机构类型代码表",
              "entries": [
                {
                  "code": "11",
                  "name": "商业银行",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "村镇银行",
                  "desc": ""
                },
                {
                  "code": "14",
                  "name": "住房储蓄银行",
                  "desc": ""
                },
                {
                  "code": "15",
                  "name": "外资银行",
                  "desc": ""
                },
                {
                  "code": "16",
                  "name": "财务公司",
                  "desc": ""
                },
                {
                  "code": "21",
                  "name": "信托公司",
                  "desc": ""
                },
                {
                  "code": "22",
                  "name": "融资租赁公司",
                  "desc": ""
                },
                {
                  "code": "23",
                  "name": "汽车金融公司",
                  "desc": ""
                },
                {
                  "code": "24",
                  "name": "消费金融公司",
                  "desc": ""
                },
                {
                  "code": "25",
                  "name": "贷款公司",
                  "desc": ""
                },
                {
                  "code": "26",
                  "name": "金融资产管理公司",
                  "desc": ""
                },
                {
                  "code": "31",
                  "name": "证券公司",
                  "desc": ""
                },
                {
                  "code": "41",
                  "name": "保险公司",
                  "desc": ""
                },
                {
                  "code": "51",
                  "name": "小额贷款公司",
                  "desc": ""
                },
                {
                  "code": "52",
                  "name": "公积金管理中心",
                  "desc": ""
                },
                {
                  "code": "53",
                  "name": "融资性担保公司",
                  "desc": ""
                },
                {
                  "code": "54",
                  "name": "保理公司",
                  "desc": ""
                },
                {
                  "code": "99",
                  "name": "其他机构",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090I02",
            "name": "业务管理机构代码",
            "occurrence": "[1..1]",
            "type": "AN4",
            "length": "4",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090D03",
            "name": "业务种类细分",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表34",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "34",
              "name": "担保业务种类细分代码表",
              "entries": [
                {
                  "code": "01",
                  "name": "贷款担保",
                  "desc": "所属业务大类为融资担保，适用于融资性担保公司。"
                },
                {
                  "code": "02",
                  "name": "票据承兑担保",
                  "desc": ""
                },
                {
                  "code": "03",
                  "name": "贸易融资担保",
                  "desc": ""
                },
                {
                  "code": "04",
                  "name": "项目融资担保",
                  "desc": ""
                },
                {
                  "code": "05",
                  "name": "信用证融资担保",
                  "desc": ""
                },
                {
                  "code": "06",
                  "name": "其他融资性担保",
                  "desc": ""
                },
                {
                  "code": "10",
                  "name": "债券发行担保",
                  "desc": ""
                },
                {
                  "code": "07",
                  "name": "诉讼保全担保",
                  "desc": "所属业务大类为非融资担保。"
                },
                {
                  "code": "08",
                  "name": "履约担保",
                  "desc": ""
                },
                {
                  "code": "09",
                  "name": "非融资担保",
                  "desc": ""
                },
                {
                  "code": "11",
                  "name": "再担保",
                  "desc": ""
                },
                {
                  "code": "12",
                  "name": "贷款保证保险",
                  "desc": ""
                },
                {
                  "code": "13",
                  "name": "个人消费信用保证保险",
                  "desc": "仅适用于相关还款责任担保账户分机构汇总信息中的业务种类细分。"
                },
                {
                  "code": "51",
                  "name": "信用证",
                  "desc": ""
                },
                {
                  "code": "61",
                  "name": "银行承兑汇票",
                  "desc": ""
                },
                {
                  "code": "62",
                  "name": "商业承兑汇票",
                  "desc": ""
                },
                {
                  "code": "71",
                  "name": "融资类银行保函",
                  "desc": ""
                },
                {
                  "code": "72",
                  "name": "非融资类银行保函",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090D04",
            "name": "五级分类",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表45",
            "domain": "借贷与担保",
            "codeTable": {
              "no": "45",
              "name": "五级分类代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "正常",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "关注",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "次级",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "可疑",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "损失",
                  "desc": ""
                },
                {
                  "code": "6",
                  "name": "违约",
                  "desc": ""
                },
                {
                  "code": "9",
                  "name": "未分类",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090J01",
            "name": "相关还款责任金额",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类、保证合同编号的组合分类汇总的相关还款责任金额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090S01",
            "name": "账户数",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类、保证合同编号的组合分类汇总的未结清账户数量。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090J02",
            "name": "余额",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类、保证合同编号的组合分类汇总的账户余额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090J03",
            "name": "担保金额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "按相关还款责任类型、业务管理机构（法人）、业务种类、五级分 类、保证合同编号的组合分类汇总的担保金额。",
            "domain": "借贷与担保",
            "children": []
          },
          {
            "level": "item",
            "tag": "ED090I03",
            "name": "保证合同编号",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "征信系统为该相关还款责任人对应的保证合同在本报告中分配的 唯一编号。 ✓ 如果没有对应的保证合同，返回空值。",
            "domain": "借贷与担保",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EEA",
    "name": "公用事业缴费账户信息",
    "occurrence": "[1..1]",
    "domain": "公用事业",
    "children": [
      {
        "level": "unit",
        "tag": "EE01",
        "name": "公用事业缴费账户信息单元",
        "occurrence": "[0..*]",
        "domain": "公用事业",
        "children": [
          {
            "level": "segment",
            "tag": "EE01A",
            "name": "基本信息段",
            "occurrence": "[1..1]",
            "domain": "公用事业",
            "children": [
              {
                "level": "item",
                "tag": "EE01AI01",
                "name": "公用事业缴费账户编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该账户在本报告中的唯一编号。",
                "domain": "公用事业",
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01AQ01",
                "name": "公用事业单位名称",
                "occurrence": "[1..1]",
                "type": "ANC..80",
                "length": "≤80",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "公用事业",
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01AD01",
                "name": "业务类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表71",
                "domain": "公用事业",
                "codeTable": {
                  "no": "71",
                  "name": "公用事业业务类型",
                  "entries": [
                    {
                      "code": "00",
                      "name": "电信缴费",
                      "desc": ""
                    },
                    {
                      "code": "01",
                      "name": "电费信息",
                      "desc": ""
                    },
                    {
                      "code": "02",
                      "name": "水费信息",
                      "desc": ""
                    },
                    {
                      "code": "03",
                      "name": "燃气费信息",
                      "desc": ""
                    },
                    {
                      "code": "04",
                      "name": "有线电视收视费",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其它",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01AD02",
                "name": "缴费状态",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "账户当前最新的缴费状态。 当业务类型为电信缴费时，码表52 当业务类型为“电费信息、水费信息、燃气费信息、有线电视收 视费、其它”时，码表53",
                "domain": "公用事业",
                "codeTable": {
                  "no": "52",
                  "name": "电信缴费状态代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "正常缴费",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "欠费",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01AJ01",
                "name": "累计欠费金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "账户当前累计的欠费金额。",
                "domain": "公用事业",
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01AR01",
                "name": "统计年月",
                "occurrence": "[1..1]",
                "type": "Month",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当前的截止时点。",
                "domain": "公用事业",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EE01B",
            "name": "过去 24 个月缴费情况信息段",
            "occurrence": "[1..1]",
            "domain": "公用事业",
            "children": [
              {
                "level": "item",
                "tag": "EE01BS01",
                "name": "缴费记录条数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "最近 24 个月的缴费记录的总条数合计。",
                "domain": "公用事业",
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01BH",
                "name": "缴费情况信息",
                "occurrence": "[0..24]",
                "type": "",
                "length": "—",
                "required": "[0..24]",
                "requiredCode": "?",
                "remark": "",
                "domain": "公用事业",
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01BR01",
                "name": "统计年月",
                "occurrence": "[1..1]",
                "type": "Month",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公用事业缴费信息的数据统计年月。",
                "domain": "公用事业",
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01BD01",
                "name": "缴费状态",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "账户当前最新的缴费状态。 当业务类型为电信缴费时，码表52 当业务类型为“电费信息、水费信息、燃气费信息、有线电视收 视费、其它”时，码表53",
                "domain": "公用事业",
                "codeTable": {
                  "no": "52",
                  "name": "电信缴费状态代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "正常缴费",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "欠费",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01BJ01",
                "name": "本月应缴金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公用事业缴费信息的本月应缴金额。",
                "domain": "公用事业",
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01BJ02",
                "name": "本月实缴金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公用事业缴费信息的本月实缴金额。",
                "domain": "公用事业",
                "children": []
              },
              {
                "level": "item",
                "tag": "EE01BJ03",
                "name": "累计欠费金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公用事业缴费信息的累计欠费金额。",
                "domain": "公用事业",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EFA",
    "name": "欠税信息",
    "occurrence": "[1..1]",
    "domain": "公共记录",
    "children": [
      {
        "level": "unit",
        "tag": "EF01",
        "name": "欠税记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF010I01",
            "name": "欠税记录编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条欠税信息在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF010Q01",
            "name": "主管税务机关名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对纳税人进行税收征收管理的税务机关的名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF010J01",
            "name": "欠税总额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "纳税人当前应缴未缴的税务金额合计。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF010R01",
            "name": "欠税统计时间",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "纳税人当前应缴未缴的税务统计时间。",
            "domain": "公共记录",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EFB",
    "name": "法院信息",
    "occurrence": "[1..1]",
    "domain": "公共记录",
    "children": [
      {
        "level": "unit",
        "tag": "EF02",
        "name": "民事判决记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF020I01",
            "name": "民事判决记录编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条民事判决记录在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020Q01",
            "name": "立案法院名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "受理诉讼案件申请的人民法院名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020I02",
            "name": "案号",
            "occurrence": "[1..1]",
            "type": "ANC..40",
            "length": "≤40",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020R01",
            "name": "立案日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020Q02",
            "name": "案由",
            "occurrence": "[1..1]",
            "type": "ANC..40",
            "length": "≤40",
            "required": "必含",
            "requiredCode": "M",
            "remark": "诉讼案件的立案原因，即当事人因何事发生纠纷而需要人民 法院进行裁决。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020D01",
            "name": "诉讼地位",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表55",
            "domain": "公共记录",
            "codeTable": {
              "no": "55",
              "name": "诉讼地位代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "原告",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "被告",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "第三人",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "上诉人",
                  "desc": ""
                },
                {
                  "code": "5",
                  "name": "被上诉人",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020D02",
            "name": "审判程序",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表56",
            "domain": "公共记录",
            "codeTable": {
              "no": "56",
              "name": "审判程序代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "第一审",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "第二审",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "再审",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "其他",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020Q03",
            "name": "诉讼标的",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当事人争议的要求人民法院通过审判予以解决的某一民事法 律关系或权利。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020J01",
            "name": "诉讼标的金额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020D03",
            "name": "结案方式",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表57",
            "domain": "公共记录",
            "codeTable": {
              "no": "57",
              "name": "结案方式代码表（民事判决记录）",
              "entries": [
                {
                  "code": "1",
                  "name": "判决",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "调解",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "其他",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020R02",
            "name": "判决/调解生效日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "该诉讼案件的判决或调解结果生效的日期。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF020Q04",
            "name": "判决/调解结果",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "该诉讼案件的判决/调解结果。",
            "domain": "公共记录",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EF03",
        "name": "强制执行记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF030I01",
            "name": "强制执行记录编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条强制执行记录在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030Q01",
            "name": "执行法院名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "受理执行案件申请的人民法院名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030I02",
            "name": "案号",
            "occurrence": "[1..1]",
            "type": "ANC..40",
            "length": "≤40",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030R01",
            "name": "立案日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030Q02",
            "name": "执行案由",
            "occurrence": "[1..1]",
            "type": "ANC..40",
            "length": "≤40",
            "required": "必含",
            "requiredCode": "M",
            "remark": "执行案件的案由，即当事人因何事发生纠纷而需要人民法院 强制执行案件的判决结果。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030Q03",
            "name": "申请执行标的",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "被执行人申请执行的标的，包括物和行为。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030J01",
            "name": "申请执行标的金额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030Q04",
            "name": "案件状态",
            "occurrence": "[1..1]",
            "type": "ANC..20",
            "length": "≤20",
            "required": "必含",
            "requiredCode": "M",
            "remark": "案件目前的状态情况。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030D01",
            "name": "结案方式",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表57",
            "domain": "公共记录",
            "codeTable": {
              "no": "57",
              "name": "结案方式代码表（民事判决记录）",
              "entries": [
                {
                  "code": "1",
                  "name": "判决",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "调解",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "其他",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030Q05",
            "name": "已执行标的",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "被执行人已执行的标的，包括物和行为。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF030J02",
            "name": "已执行标的金额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EFC",
    "name": "行政处罚信息",
    "occurrence": "[1..1]",
    "domain": "公共记录",
    "children": [
      {
        "level": "unit",
        "tag": "EF04",
        "name": "行政处罚记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF040I01",
            "name": "行政处罚记录编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条行政处罚记录在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF040Q01",
            "name": "处罚机构名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对当事人进行处罚的机构名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF040I02",
            "name": "处罚决定书文号",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "处罚文书的编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF040Q02",
            "name": "违法行为",
            "occurrence": "[1..1]",
            "type": "ANC..500",
            "length": "≤500",
            "required": "必含",
            "requiredCode": "M",
            "remark": "处罚机构对当事人违法行为的描述。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF040Q03",
            "name": "处罚决定",
            "occurrence": "[1..1]",
            "type": "ANC..500",
            "length": "≤500",
            "required": "必含",
            "requiredCode": "M",
            "remark": "处罚机构对违法行为做出处罚的具体描述。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF040R01",
            "name": "处罚日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF040J01",
            "name": "处罚金额",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF040Q04",
            "name": "处罚执行情况",
            "occurrence": "[1..1]",
            "type": "ANC..500",
            "length": "≤500",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF040Q05",
            "name": "行政复议结果",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "复议机关复议后的结论。",
            "domain": "公共记录",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EFD",
    "name": "住房公积金参缴信息",
    "occurrence": "[1..1]",
    "domain": "公共记录",
    "children": [
      {
        "level": "unit",
        "tag": "EF05",
        "name": "住房公积金参缴记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "segment",
            "tag": "EF05A",
            "name": "基本信息段",
            "occurrence": "[1..1]",
            "domain": "公共记录",
            "children": [
              {
                "level": "item",
                "tag": "EF05AI01",
                "name": "账户编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该公积金账户在本报告中的唯一编号。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05AR01",
                "name": "初缴年月",
                "occurrence": "[1..1]",
                "type": "Month",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公积金缴存账户第一次存在余额的年月。 ➢ “0000-00”表示已经开户但暂无余额。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05AS01",
                "name": "职工人数",
                "occurrence": "[1..1]",
                "type": "uInt..10",
                "length": "≤10",
                "required": "必含",
                "requiredCode": "M",
                "remark": "信息主体企业的职工人数信息。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05AJ01",
                "name": "缴费基数",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公积金当前的缴费基数。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05AR02",
                "name": "最近一次缴费日期",
                "occurrence": "[1..1]",
                "type": "Date",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "企业最近一次缴存公积金的日期。 ➢ “0000-00-00”表示在开户后没有缴款历史。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05AR03",
                "name": "缴至年月",
                "occurrence": "[1..1]",
                "type": "Month",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公积金目前缴存到哪个月为止。 ➢ “0000-00”表示在开户后没有缴款历史。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05AD01",
                "name": "缴费状态",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表59",
                "domain": "公共记录",
                "codeTable": {
                  "no": "59",
                  "name": "住房公积金缴费状态代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "正常缴费",
                      "desc": ""
                    },
                    {
                      "code": "1",
                      "name": "暂停缴费（中断）",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "终止缴费",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05AJ02",
                "name": "累计欠费金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当前的累计欠缴金额。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05AR04",
                "name": "统计年月",
                "occurrence": "[1..1]",
                "type": "Month",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公积金缴存账户信息的数据统计年月。",
                "domain": "公共记录",
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EF05B",
            "name": "过去 24 个月缴费情况信息段",
            "occurrence": "[1..1]",
            "domain": "公共记录",
            "children": [
              {
                "level": "item",
                "tag": "EF05BS01",
                "name": "缴费记录条数",
                "occurrence": "[1..1]",
                "type": "uInt..3",
                "length": "≤3",
                "required": "必含",
                "requiredCode": "M",
                "remark": "最近 24 个月的缴费记录的总条数合计。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05BH",
                "name": "缴费情况信息",
                "occurrence": "[0..24]",
                "type": "",
                "length": "—",
                "required": "[0..24]",
                "requiredCode": "?",
                "remark": "",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05BR01",
                "name": "统计年月",
                "occurrence": "[1..1]",
                "type": "Month",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "公积金缴存账户信息的数据统计年月。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05BD01",
                "name": "缴费状态",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表59",
                "domain": "公共记录",
                "codeTable": {
                  "no": "59",
                  "name": "住房公积金缴费状态代码表",
                  "entries": [
                    {
                      "code": "0",
                      "name": "正常缴费",
                      "desc": ""
                    },
                    {
                      "code": "1",
                      "name": "暂停缴费（中断）",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "终止缴费",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05BJ01",
                "name": "本月应缴金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当月（统计年月）应该缴纳的金额。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05BJ02",
                "name": "本月实缴金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当月（统计年月）实际缴纳的金额。",
                "domain": "公共记录",
                "children": []
              },
              {
                "level": "item",
                "tag": "EF05BJ03",
                "name": "累计欠费金额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "截至统计年月的累计欠费金额。",
                "domain": "公共记录",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EFE",
    "name": "获得认证/奖励相关信息",
    "occurrence": "[1..1]",
    "domain": "公共记录",
    "children": [
      {
        "level": "unit",
        "tag": "EF06",
        "name": "获得许可记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF060I01",
            "name": "许可记录编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条许可记录在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF060Q01",
            "name": "许可部门名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "向信息主体颁发许可的部门。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF060Q02",
            "name": "许可类型",
            "occurrence": "[1..1]",
            "type": "ANC..40",
            "length": "≤40",
            "required": "必含",
            "requiredCode": "M",
            "remark": "认可的名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF060R01",
            "name": "许可日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "认可部门批准/评定该认可的日期。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF060R02",
            "name": "截止日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "许可有效期的截至时间。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF060Q03",
            "name": "许可内容",
            "occurrence": "[1..1]",
            "type": "ANC..1000",
            "length": "≤1000",
            "required": "必含",
            "requiredCode": "M",
            "remark": "许可部门对信息主体做出可的具体内容，包括许事项名称。",
            "domain": "公共记录",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EF07",
        "name": "获得认证记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF070I01",
            "name": "认证记录编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条认证记录在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF070Q01",
            "name": "认证部门名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "批准认证的具体行政机构的名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF070Q02",
            "name": "认证类型",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "认证的名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF070R01",
            "name": "认证日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "认证部门批准/评定该认证的日期。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF070R02",
            "name": "截止日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "认证部门对认证规定的有效期截止日。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF070Q03",
            "name": "认证内容",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "认证部门对信息主体被允许从事的具体行业或事项的描述。",
            "domain": "公共记录",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EF08",
        "name": "获得资质记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF080I01",
            "name": "资质记录编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条记录在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF080Q01",
            "name": "认定部门名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对信息主体进行资质认定的机构的名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF080Q02",
            "name": "资质类型",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "信息主体所获得资质的名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF080R01",
            "name": "批准日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "信息主体取得资质的日期。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF080R02",
            "name": "截止日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "资质有效期的截止日。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF080Q03",
            "name": "资质内容",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "认定部门对信息主体所获得的资质的具体描述。",
            "domain": "公共记录",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EF09",
        "name": "获得奖励记录信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF090I01",
            "name": "奖励记录编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条记录在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF090Q01",
            "name": "奖励部门名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "向信息主体颁发奖励的机构的名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF090Q02",
            "name": "奖励名称",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "信息主体所获得奖励的称号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF090R01",
            "name": "授予日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "信息主体获得奖励的日期。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF090R02",
            "name": "截止日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "奖励有效期的截止日。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF090Q03",
            "name": "奖励事实",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "奖励内容的具体描述。",
            "domain": "公共记录",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EF10",
        "name": "拥有专利情况信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF100I01",
            "name": "信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条信息在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF100Q01",
            "name": "专利名称",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF100I02",
            "name": "专利号",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF100R01",
            "name": "申请日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF100R02",
            "name": "授予日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF100S01",
            "name": "专利有效期",
            "occurrence": "[1..1]",
            "type": "uInt..3",
            "length": "≤3",
            "required": "必含",
            "requiredCode": "M",
            "remark": "以年为单位。",
            "domain": "公共记录",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EFF",
    "name": "进出口检验相关信息",
    "occurrence": "[1..1]",
    "domain": "公共记录",
    "children": [
      {
        "level": "unit",
        "tag": "EF11",
        "name": "出入境检验检疫绿色通道信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF110I01",
            "name": "信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条信息在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF110Q01",
            "name": "批准部门名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "批准进入出入境检验检疫绿色通道的部门。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF110Q02",
            "name": "出口商品名称",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF110R01",
            "name": "生效日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EF12",
        "name": "进出口商品免验信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF120I01",
            "name": "信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条信息在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF120Q01",
            "name": "批准部门名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "批准进出口商品免验的部门的名称。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF120Q02",
            "name": "免验商品名称",
            "occurrence": "[1..1]",
            "type": "ANC..100",
            "length": "≤100",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF120I02",
            "name": "免验号",
            "occurrence": "[1..1]",
            "type": "ANC..50",
            "length": "≤50",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF120R02",
            "name": "截至日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EF13",
        "name": "进出口商品检验分类监管信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF130I01",
            "name": "信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条信息在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF130Q01",
            "name": "监管部门名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "对进出口商品进行分类检验的监管部门。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF130Q02",
            "name": "管辖直属局",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "负责对生产企业进行分类并实施检验监督管理的各直属检验 检疫局。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF130D01",
            "name": "监管级别",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表60",
            "domain": "公共记录",
            "codeTable": {
              "no": "60",
              "name": "进出口商品校验分类监管级别代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "一类企业",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "二类企业",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EF130R01",
            "name": "生效日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF130R02",
            "name": "截至日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "",
            "domain": "公共记录",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EFG",
    "name": "融资规模控制信息",
    "occurrence": "[1..1]",
    "domain": "公共记录",
    "children": [
      {
        "level": "unit",
        "tag": "EF14",
        "name": "融资规模控制信息单元",
        "occurrence": "[0..*]",
        "domain": "公共记录",
        "children": [
          {
            "level": "item",
            "tag": "EF140I01",
            "name": "信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条信息在本报告中的唯一编号。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF140D01",
            "name": "所属名录",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "1 - 土地储备机构名录",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF140D02",
            "name": "融资控制类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "1 - 年度可融资规模",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF140R01",
            "name": "年度",
            "occurrence": "[1..1]",
            "type": "Year",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "融资控制年度信息。",
            "domain": "公共记录",
            "children": []
          },
          {
            "level": "item",
            "tag": "EF140J01",
            "name": "规模",
            "occurrence": "[1..1]",
            "type": "uInt..15",
            "length": "≤15",
            "required": "必含",
            "requiredCode": "M",
            "remark": "融资规模的控制金额上限。",
            "domain": "公共记录",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EGA",
    "name": "财务信息",
    "occurrence": "[1..1]",
    "domain": "财务与评级",
    "children": [
      {
        "level": "unit",
        "tag": "EG01",
        "name": "企业资产负债表（2002 版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG01A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG01AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG01B",
            "name": "企业资产负债表（2002 版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG01BJ01",
                "name": "货币资金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《2002 年度会计报表编制手册》",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ02",
                "name": "短期投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ03",
                "name": "应收票据",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ04",
                "name": "应收股利",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ05",
                "name": "应收利息",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ06",
                "name": "应收账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ07",
                "name": "其他应收款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ08",
                "name": "预付账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ09",
                "name": "期货保证金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ10",
                "name": "应收补贴款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ11",
                "name": "应收出口退税",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ12",
                "name": "存货",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ13",
                "name": "存货原材料",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ14",
                "name": "存货产成品",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ15",
                "name": "待摊费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ16",
                "name": "待处理流动资产净损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ17",
                "name": "一年内到期的长期债权投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ18",
                "name": "其他流动资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ19",
                "name": "流动资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ20",
                "name": "长期投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ21",
                "name": "长期股权投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ22",
                "name": "长期债权投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ23",
                "name": "合并价差",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ24",
                "name": "长期投资合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ25",
                "name": "固定资产原价",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ26",
                "name": "累计折旧",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ27",
                "name": "固定资产净值",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ28",
                "name": "固定资产值减值准备",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ29",
                "name": "固定资产净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ30",
                "name": "固定资产清理",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ31",
                "name": "工程物资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ32",
                "name": "在建工程",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ33",
                "name": "待处理固定资产净损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ34",
                "name": "固定资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ35",
                "name": "无形资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ36",
                "name": "（无形资产科目下）土地使用权",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ37",
                "name": "递延资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ38",
                "name": "（递延资产科目下）固定资产修理",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ39",
                "name": "（递延资产科目下）固定资产改良支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ40",
                "name": "其他长期资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ41",
                "name": "（其他长期资产科目下）特准储备物资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ42",
                "name": "无形及其他资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ43",
                "name": "递延税款借项",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ44",
                "name": "资产总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ45",
                "name": "短期借款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ46",
                "name": "应付票据",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ47",
                "name": "应付账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ48",
                "name": "预收账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ49",
                "name": "应付工资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ50",
                "name": "应付福利费",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ51",
                "name": "应付利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ52",
                "name": "应交税金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ53",
                "name": "其他应交款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ54",
                "name": "其他应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ55",
                "name": "预提费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ56",
                "name": "预计负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ57",
                "name": "一年内到期的长期负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ58",
                "name": "其他流动负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ59",
                "name": "流动负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ60",
                "name": "长期借款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ61",
                "name": "应付债券",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ62",
                "name": "长期应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ63",
                "name": "专项应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ64",
                "name": "其他长期负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ65",
                "name": "（其他长期负债科目下）特准储备基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ66",
                "name": "长期负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ67",
                "name": "递延税款贷项",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ68",
                "name": "负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ69",
                "name": "少数股东权益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ70",
                "name": "实收资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ71",
                "name": "国家资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ72",
                "name": "集体资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ73",
                "name": "法人资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ74",
                "name": "（法人资本科目下）国有法人资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ75",
                "name": "（法人资本科目下）集体法人资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ76",
                "name": "个人资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ77",
                "name": "外商资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ78",
                "name": "资本公积",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ79",
                "name": "盈余公积",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ80",
                "name": "（盈余公积科目下）法定盈余公积",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ81",
                "name": "（盈余公积科目下）公益金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ82",
                "name": "（盈余公积科目下）补充流动资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ83",
                "name": "未确认的投资损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ84",
                "name": "未分配利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ85",
                "name": "外币报表折算差额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ86",
                "name": "所有者权益合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG01BJ87",
                "name": "负债和所有者权益总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG02",
        "name": "企业资产负债表（2007 版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG02A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG02AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG02B",
            "name": "企业资产负债表（2007 版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG02BJ01",
                "name": "货币资金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《企业会计准则—基本准则（2006）》",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ02",
                "name": "交易性金融资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ03",
                "name": "应收票据",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ04",
                "name": "应收账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ05",
                "name": "预付账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ06",
                "name": "应收利息",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ07",
                "name": "应收股利",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ08",
                "name": "其他应收款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ09",
                "name": "存货",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ10",
                "name": "一年内到期的非流动资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ11",
                "name": "其他流动资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ12",
                "name": "流动资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ13",
                "name": "可供出售的金融资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ14",
                "name": "持有至到期投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ15",
                "name": "长期股权投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ16",
                "name": "长期应收款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ17",
                "name": "投资性房地产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ18",
                "name": "固定资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ19",
                "name": "在建工程",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ20",
                "name": "工程物资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ21",
                "name": "固定资产清理",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ22",
                "name": "生产性生物资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ23",
                "name": "油气资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ24",
                "name": "无形资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ25",
                "name": "开发支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ26",
                "name": "商誉",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ27",
                "name": "长期待摊费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ28",
                "name": "递延所得税资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ29",
                "name": "其他非流动资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ30",
                "name": "非流动资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ31",
                "name": "资产总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ32",
                "name": "短期借款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ33",
                "name": "交易性金融负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ34",
                "name": "应付票据",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ35",
                "name": "应付账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ36",
                "name": "预收账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ37",
                "name": "应付利息",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ38",
                "name": "应付职工薪酬",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ39",
                "name": "应交税费",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ40",
                "name": "应付股利",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ41",
                "name": "其他应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ42",
                "name": "一年内到期的非流动负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ43",
                "name": "其他流动负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ44",
                "name": "流动负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ45",
                "name": "长期借款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ46",
                "name": "应付债券",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ47",
                "name": "长期应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ48",
                "name": "专项应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ49",
                "name": "预计负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ50",
                "name": "递延所得税负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ51",
                "name": "其他非流动负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ52",
                "name": "非流动负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ53",
                "name": "负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ54",
                "name": "实收资本（或股本）",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ55",
                "name": "资本公积",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ56",
                "name": "减：库存股",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ57",
                "name": "盈余公积",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ58",
                "name": "未分配利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ59",
                "name": "所有者权益合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG02BJ60",
                "name": "负债和所有者权益合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG03",
        "name": "企业利润表及利润分配表（2002版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG03A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG03AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG03B",
            "name": "企业利润及利润分配表（2002 版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG03BJ01",
                "name": "主营业务收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《2002 年度会计报表编制手册》",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ02",
                "name": "（主营业务收入科目下）出口产品销售收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ03",
                "name": "（主营业务收入科目下）进口产品销售收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ04",
                "name": "销售折扣与折让",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ05",
                "name": "主营业务收入净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ06",
                "name": "主营业务成本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ07",
                "name": "（主营业务成本科目下）出口产品销售成本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ08",
                "name": "主营业务税金及附加",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ09",
                "name": "经营费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ10",
                "name": "其他（业务成本）",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ11",
                "name": "递延收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ12",
                "name": "代购代销收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ13",
                "name": "其他（收入）",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ14",
                "name": "主营业务利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ15",
                "name": "其他业务利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ16",
                "name": "营业费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ17",
                "name": "管理费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ18",
                "name": "财务费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ19",
                "name": "其他（费用）",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ20",
                "name": "营业利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ21",
                "name": "投资收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ22",
                "name": "期货收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ23",
                "name": "补贴收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ24",
                "name": "（补贴收入科目下）补贴前亏损的企业补贴收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ25",
                "name": "营业外收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ26",
                "name": "（营业外收入科目下）处置固定资产净收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ27",
                "name": "（营业外收入科目下）非货币性交易收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ28",
                "name": "（营业外收入科目下）出售无形资产收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ29",
                "name": "（营业外收入科目下）罚款净收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ30",
                "name": "其他（利润）",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ31",
                "name": "（其他科目下）用以前年度含量工资节余弥补利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ32",
                "name": "营业外支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ33",
                "name": "（营业外支出科目下）处置固定资产净损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ34",
                "name": "（营业外支出科目下）债务重组损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ35",
                "name": "（营业外支出科目下）罚款支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ36",
                "name": "（营业外支出科目下）捐赠支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ37",
                "name": "其他支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ38",
                "name": "（其他支出）结转的含量工资包干节余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ39",
                "name": "利润总额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ40",
                "name": "所得税",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ41",
                "name": "少数股东损益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ42",
                "name": "未确认的投资损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ43",
                "name": "净利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ44",
                "name": "年初未分配利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ45",
                "name": "盈余公积补亏",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ46",
                "name": "其他调整因素",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ47",
                "name": "可供分配的利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ48",
                "name": "单项留用的利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ49",
                "name": "补充流动资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ50",
                "name": "提取法定盈余公积",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ51",
                "name": "提取法定公益金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ52",
                "name": "提取职工奖励及福利基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ53",
                "name": "提取储备基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ54",
                "name": "提取企业发展基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ55",
                "name": "利润归还投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ56",
                "name": "（可供分配的利润科目下）其他",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ57",
                "name": "可供投资者分配的利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ58",
                "name": "应付优先股股利",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ59",
                "name": "提取任意盈余公积",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ60",
                "name": "应付普通股股利",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ61",
                "name": "转作资本的普通股股利",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ62",
                "name": "（可供投资者分配的利润科目下）其他",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ63",
                "name": "未分配利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG03BJ64",
                "name": "（未分配利润科目下）应由以后年度税前利润弥补的亏损",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG04",
        "name": "企业利润表及利润分配表（2007版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG04A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG04AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG04B",
            "name": "企业利润及利润分配表（2007 版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG04BJ01",
                "name": "营业收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《企业会计准则—基本准则（2006）》",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ02",
                "name": "营业成本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ03",
                "name": "营业税金及附加",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ04",
                "name": "销售费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ05",
                "name": "管理费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ06",
                "name": "财务费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ07",
                "name": "资产减值损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ08",
                "name": "公允价值变动净收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ09",
                "name": "投资净收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ10",
                "name": "对联营企业和合营企业的投资收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ11",
                "name": "营业利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ12",
                "name": "营业外收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ13",
                "name": "营业外支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ14",
                "name": "非流动资产损失（其中：非流动资产处置损失）",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ15",
                "name": "利润总额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ16",
                "name": "所得税费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ17",
                "name": "净利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ18",
                "name": "基本每股收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG04BJ19",
                "name": "稀释每股收益",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG05",
        "name": "企业现金流量表（2002 版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG05A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG05AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG05B",
            "name": "企业现金流量表（2002 版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG05BJ01",
                "name": "销售商品和提供劳务收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《2002 年度会计报表编制手册》",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ02",
                "name": "收到的税费返还",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ03",
                "name": "收到的其他与经营活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ04",
                "name": "经营活动现金流入小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ05",
                "name": "购买商品、接受劳务支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ06",
                "name": "支付给职工以及为职工支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ07",
                "name": "支付的各项税费",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ08",
                "name": "支付的其他与经营活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ09",
                "name": "经营活动现金流出小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ10",
                "name": "经营活动产生的现金流量净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ11",
                "name": "收回投资所收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ12",
                "name": "取得投资收益所收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ13",
                "name": "处置固定资产无形资产和其他长期资产所收回的现金净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ14",
                "name": "收到的其他与投资活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ15",
                "name": "投资活动现金流入小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ16",
                "name": "购建固定资产无形资产和其他长期资产所支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ17",
                "name": "投资所支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ18",
                "name": "支付的其他与投资活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ19",
                "name": "投资活动现金流出小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ20",
                "name": "投资活动产生的现金流量净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ21",
                "name": "吸收投资所收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ22",
                "name": "借款所收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ23",
                "name": "收到的其他与筹资活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ24",
                "name": "筹资活动现金流入小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ25",
                "name": "偿还债务所支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ26",
                "name": "分配股利、利润或偿付利息所支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ27",
                "name": "支付的其他与筹资活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ28",
                "name": "筹资活动现金流出小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ29",
                "name": "筹集活动产生的现金流量净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ30",
                "name": "汇率变动对现金的影响",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ31",
                "name": "现金及现金等价物净增加额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ32",
                "name": "净利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ33",
                "name": "计提的资产减值准备",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ34",
                "name": "固定资产拆旧",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ35",
                "name": "无形资产摊销",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ36",
                "name": "长期待摊费用摊销",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ37",
                "name": "待摊费用减少",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ38",
                "name": "预提费用增加",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ39",
                "name": "处置固定资产无形资产和其他长期资产的损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ40",
                "name": "固定资产报废损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ41",
                "name": "财务费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ42",
                "name": "投资损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ43",
                "name": "递延税款贷项",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ44",
                "name": "存货的减少",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ45",
                "name": "经营性应收项目的减少",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ46",
                "name": "经营性应付项目的增加",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ47",
                "name": "（净利润调节为经营活动现金流量科目下）其他",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ48",
                "name": "经营活动产生的现金流量净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ49",
                "name": "债务转为资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ50",
                "name": "一年内到期的可转换公司债券",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ51",
                "name": "融资租入固定资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ52",
                "name": "（不涉及现金收支的投资和筹资活动科目下）其他",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ53",
                "name": "现金的期末余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ54",
                "name": "现金的期初余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ55",
                "name": "现金等价物的期末余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ56",
                "name": "现金等价物的期初余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG05BJ57",
                "name": "现金及现金等价物净增加额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG06",
        "name": "企业现金流量表（2007 版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG06A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG06AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG06B",
            "name": "企业现金流量表（2007 版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG06BJ01",
                "name": "销售商品和提供劳务收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《企业会计准则—基本准则（2006）》",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ02",
                "name": "收到的税费返还",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ03",
                "name": "收到其他与经营活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ04",
                "name": "经营活动现金流入小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ05",
                "name": "购买商品、接受劳务支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ06",
                "name": "支付给职工以及为职工支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ07",
                "name": "支付的各项税费",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ08",
                "name": "支付其他与经营活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ09",
                "name": "经营活动现金流出小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ10",
                "name": "经营活动产生的现金流量净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ11",
                "name": "收回投资所收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ12",
                "name": "取得投资收益所收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ13",
                "name": "处置固定资产无形资产和其他长期资产所收回的现金净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ14",
                "name": "处置子公司及其他营业单位收到的现金净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ15",
                "name": "收到其他与投资活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ16",
                "name": "投资活动现金流入小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ17",
                "name": "购建固定资产无形资产和其他长期资产所支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ18",
                "name": "投资所支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ19",
                "name": "取得子公司及其他营业单位支付的现金净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ20",
                "name": "支付其他与投资活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ21",
                "name": "投资活动现金流出小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ22",
                "name": "投资活动产生的现金流量净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ23",
                "name": "吸收投资收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ24",
                "name": "取得借款收到的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ25",
                "name": "收到其他与筹资活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ26",
                "name": "筹资活动现金流入小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ27",
                "name": "偿还债务所支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ28",
                "name": "分配股利、利润或偿付利息所支付的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ29",
                "name": "支付其他与筹资活动有关的现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ30",
                "name": "筹资活动现金流出小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ31",
                "name": "筹集活动产生的现金流量净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ32",
                "name": "汇率变动对现金及现金等价物的影响",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ33",
                "name": "现金及现金等价物净增加额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ34",
                "name": "期初现金及现金等价物余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ35",
                "name": "期末现金及现金等价物余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ36",
                "name": "净利润",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ37",
                "name": "资产减值准备",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ38",
                "name": "固定资产折旧、油气资产折耗、生产性生物资产折旧",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ39",
                "name": "无形资产摊销",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ40",
                "name": "长期待摊费用摊销",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ41",
                "name": "待摊费用减少",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ42",
                "name": "预提费用增加",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ43",
                "name": "处置固定资产无形资产和其他长期资产的损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ44",
                "name": "固定资产报废损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ45",
                "name": "公允价值变动损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ46",
                "name": "财务费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ47",
                "name": "投资损失",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ48",
                "name": "递延所得税资产减少",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ49",
                "name": "递延所得税负债增加",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ50",
                "name": "存货的减少",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ51",
                "name": "经营性应收项目的减少",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ52",
                "name": "经营性应付项目的增加",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ53",
                "name": "（净利润调节为经营活动现金流量科目下）其他",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ54",
                "name": "经营活动产生的现金流量净额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ55",
                "name": "债务转为资本",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ56",
                "name": "一年内到期的可转换公司债券",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ57",
                "name": "融资租入固定资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ58",
                "name": "现金的期末余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ59",
                "name": "现金的期初余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ60",
                "name": "现金等价物的期末余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ61",
                "name": "现金等价物的期初余额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ62",
                "name": "现金及现金等价物净增加额",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG06BJ63",
                "name": "（不涉及现金收支的投资和筹资活动科目下）其他",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG07",
        "name": "事业单位资产负债表（1997 版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG07A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG07AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG07B",
            "name": "事业单位资产负债表（1997版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG07BJ01",
                "name": "现金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《事业单位会计准则（2012）》（财政部令第 72 号）",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ02",
                "name": "银行存款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ03",
                "name": "应收票据",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ04",
                "name": "应收账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ05",
                "name": "预付账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ06",
                "name": "其他应收款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ07",
                "name": "材料",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ08",
                "name": "产成品",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ09",
                "name": "对外投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ10",
                "name": "固定资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ11",
                "name": "无形资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ12",
                "name": "资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ13",
                "name": "拨出经费",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ14",
                "name": "拨出专款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ15",
                "name": "专款支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ16",
                "name": "事业支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ17",
                "name": "经营支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ18",
                "name": "成本费用",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ19",
                "name": "销售税金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ20",
                "name": "上缴上级支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ21",
                "name": "对附属单位补助",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ22",
                "name": "结转自筹基建",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ23",
                "name": "支出合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ24",
                "name": "资产部类总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ25",
                "name": "借记款项",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ26",
                "name": "应付票据",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ27",
                "name": "应付账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ28",
                "name": "预收账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ29",
                "name": "其他应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ30",
                "name": "应缴预算款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ31",
                "name": "应缴财政专户款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ32",
                "name": "应交税金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ33",
                "name": "负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ34",
                "name": "事业基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ35",
                "name": "一般基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ36",
                "name": "投资基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ37",
                "name": "固定基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ38",
                "name": "专用基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ39",
                "name": "事业结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ40",
                "name": "经营结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ41",
                "name": "净资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ42",
                "name": "财政补助收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ43",
                "name": "上级补助收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ44",
                "name": "拨入专款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ45",
                "name": "事业收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ46",
                "name": "经营收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ47",
                "name": "附属单位缴款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ48",
                "name": "其他收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ49",
                "name": "收入合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG07BJ50",
                "name": "负债部类总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG08",
        "name": "事业单位资产负债表（2013 版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG08A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG08AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG08B",
            "name": "事业单位资产负债表（2013版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG08BJ01",
                "name": "货币资金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《事业单位会计准则（2012）》（财政部令第 72 号）",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ02",
                "name": "短期投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ03",
                "name": "财政应返还额度",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ04",
                "name": "应收票据",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ05",
                "name": "应收账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ06",
                "name": "预付账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ07",
                "name": "其他应收款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ08",
                "name": "存货",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ09",
                "name": "其他流动资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ10",
                "name": "流动资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ11",
                "name": "长期投资",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ12",
                "name": "固定资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ13",
                "name": "固定资产原价",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ14",
                "name": "累计折旧",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ15",
                "name": "在建工程",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ16",
                "name": "无形资产",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ17",
                "name": "无形资产原价",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ18",
                "name": "累计摊销",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ19",
                "name": "待处置资产损溢",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ20",
                "name": "非流动资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ21",
                "name": "资产总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ22",
                "name": "短期借款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ23",
                "name": "应缴税费",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ24",
                "name": "应缴国库款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ25",
                "name": "应缴财政专户款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ26",
                "name": "应付职工薪酬",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ27",
                "name": "应付票据",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ28",
                "name": "应付账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ29",
                "name": "预收账款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ30",
                "name": "其他应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ31",
                "name": "其他流动负债",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ32",
                "name": "流动负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ33",
                "name": "长期借款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ34",
                "name": "长期应付款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ35",
                "name": "非流动负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ36",
                "name": "负债合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ37",
                "name": "事业基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ38",
                "name": "非流动资产基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ39",
                "name": "专用基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ40",
                "name": "财政补助结转",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ41",
                "name": "财政补助结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ42",
                "name": "非财政补助结转",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ43",
                "name": "非财政补助结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ44",
                "name": "事业结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ45",
                "name": "经营结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ46",
                "name": "净资产合计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG08BJ47",
                "name": "负债和净资产总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG09",
        "name": "事业单位收入支出表（1997 版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG09A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG09AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG09B",
            "name": "事业单位收入支出表（1997版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG09BJ01",
                "name": "财政补助收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《事业单位会计准则（2012）》（财政部令第 72 号）",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ02",
                "name": "上级补助收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ03",
                "name": "附属单位缴款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ04",
                "name": "事业收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ05",
                "name": "预算外资金收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ06",
                "name": "其他收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ07",
                "name": "事业收入小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ08",
                "name": "经营收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ09",
                "name": "经营收入小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ10",
                "name": "拨入专款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ11",
                "name": "拨入专款小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ12",
                "name": "收入总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ13",
                "name": "拨出经费",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ14",
                "name": "上缴上级支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ15",
                "name": "对附属单位补助",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ16",
                "name": "事业支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ17",
                "name": "财政补助支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ18",
                "name": "预算外资金支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ19",
                "name": "销售税金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ20",
                "name": "结转自筹基建",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ21",
                "name": "事业支出小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ22",
                "name": "经营支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ23",
                "name": "销售税金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ24",
                "name": "经营支出小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ25",
                "name": "拨出专款",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ26",
                "name": "专款支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ27",
                "name": "专款小计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ28",
                "name": "支出总计",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ29",
                "name": "事业结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ30",
                "name": "正常收入结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ31",
                "name": "收回以前年度事业支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ32",
                "name": "经营结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ33",
                "name": "以前年度经营亏损",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ34",
                "name": "结余分配",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ35",
                "name": "应交所得税",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ36",
                "name": "提取专用基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ37",
                "name": "转入事业基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG09BJ38",
                "name": "其他结余分配",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      },
      {
        "level": "unit",
        "tag": "EG10",
        "name": "事业单位收入支出表（2013 版）信息单元",
        "occurrence": "[0..56]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "segment",
            "tag": "EG10A",
            "name": "基础段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG10AI01",
                "name": "财务报表编号",
                "occurrence": "[1..1]",
                "type": "AN..6",
                "length": "≤6",
                "required": "必含",
                "requiredCode": "M",
                "remark": "系统分配给该财务报表在本报告中的唯一编号。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10AD01",
                "name": "业务管理机构",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，该数据项返回代码如下：00-本机构 当查询机构与业务管理机构不属于同一法人机构时，该数据项返回业务管理机构的类型代码，码表21",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "21",
                  "name": "业务管理机构类型代码表",
                  "entries": [
                    {
                      "code": "11",
                      "name": "商业银行",
                      "desc": ""
                    },
                    {
                      "code": "12",
                      "name": "村镇银行",
                      "desc": ""
                    },
                    {
                      "code": "14",
                      "name": "住房储蓄银行",
                      "desc": ""
                    },
                    {
                      "code": "15",
                      "name": "外资银行",
                      "desc": ""
                    },
                    {
                      "code": "16",
                      "name": "财务公司",
                      "desc": ""
                    },
                    {
                      "code": "21",
                      "name": "信托公司",
                      "desc": ""
                    },
                    {
                      "code": "22",
                      "name": "融资租赁公司",
                      "desc": ""
                    },
                    {
                      "code": "23",
                      "name": "汽车金融公司",
                      "desc": ""
                    },
                    {
                      "code": "24",
                      "name": "消费金融公司",
                      "desc": ""
                    },
                    {
                      "code": "25",
                      "name": "贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "26",
                      "name": "金融资产管理公司",
                      "desc": ""
                    },
                    {
                      "code": "31",
                      "name": "证券公司",
                      "desc": ""
                    },
                    {
                      "code": "41",
                      "name": "保险公司",
                      "desc": ""
                    },
                    {
                      "code": "51",
                      "name": "小额贷款公司",
                      "desc": ""
                    },
                    {
                      "code": "52",
                      "name": "公积金管理中心",
                      "desc": ""
                    },
                    {
                      "code": "53",
                      "name": "融资性担保公司",
                      "desc": ""
                    },
                    {
                      "code": "54",
                      "name": "保理公司",
                      "desc": ""
                    },
                    {
                      "code": "99",
                      "name": "其他机构",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10AI02",
                "name": "业务管理机构代码",
                "occurrence": "[1..1]",
                "type": "AN4",
                "length": "4",
                "required": "必含",
                "requiredCode": "M",
                "remark": "当查询机构与业务管理机构属于同一法人机构时，此数据项返回空值； 当查询机构与业务管理机构不属于同一法人机构时，该数据项为业务管理机构在本报告中的 4 位编码，同一份报告中同一法人机构下的业务管理机构采用相同的编码。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10AR01",
                "name": "报表年份",
                "occurrence": "[1..1]",
                "type": "Year",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "财务报表所属的年份。",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10AD02",
                "name": "报表类型",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表63",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "63",
                  "name": "财务报表类型代码表",
                  "entries": [
                    {
                      "code": "10",
                      "name": "年报",
                      "desc": ""
                    },
                    {
                      "code": "20",
                      "name": "半年报（上）",
                      "desc": ""
                    },
                    {
                      "code": "30",
                      "name": "半年报（下）",
                      "desc": ""
                    },
                    {
                      "code": "40",
                      "name": "季报（一）",
                      "desc": ""
                    },
                    {
                      "code": "50",
                      "name": "季报（二）",
                      "desc": ""
                    },
                    {
                      "code": "60",
                      "name": "季报（三）",
                      "desc": ""
                    },
                    {
                      "code": "70",
                      "name": "季报（四）",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10AD03",
                "name": "报表类型细分",
                "occurrence": "[1..1]",
                "type": "Enum",
                "length": "—",
                "required": "必含",
                "requiredCode": "M",
                "remark": "码表64",
                "domain": "财务与评级",
                "codeTable": {
                  "no": "64",
                  "name": "财务报表类型细分代码表",
                  "entries": [
                    {
                      "code": "1",
                      "name": "本部报表",
                      "desc": ""
                    },
                    {
                      "code": "2",
                      "name": "合并报表",
                      "desc": ""
                    }
                  ]
                },
                "children": []
              }
            ]
          },
          {
            "level": "segment",
            "tag": "EG10B",
            "name": "事业单位收入支出表（2013版）段",
            "occurrence": "[1..1]",
            "domain": "财务与评级",
            "children": [
              {
                "level": "item",
                "tag": "EG10BJ01",
                "name": "本期财政补助结转结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "参见《事业单位会计准则（2012）》（财政部令第 72 号）",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ02",
                "name": "财政补助收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ03",
                "name": "事业支出（财政补助支出）",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ04",
                "name": "本期事业结转结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ05",
                "name": "事业类收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ06",
                "name": "事业收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ07",
                "name": "上级补助收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ08",
                "name": "附属单位上缴收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ09",
                "name": "其他收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ10",
                "name": "（其他收入科目下）捐赠收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ11",
                "name": "事业类支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ12",
                "name": "事业支出（非财政补助支出）",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ13",
                "name": "上缴上级支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ14",
                "name": "对附属单位补助支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ15",
                "name": "其他支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ16",
                "name": "本期经营结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ17",
                "name": "经营收入",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ18",
                "name": "经营支出",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ19",
                "name": "弥补以前年度亏损后的经营结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ20",
                "name": "本年非财政补助结转结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ21",
                "name": "非财政补助结转",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ22",
                "name": "本年非财政补助结余",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ23",
                "name": "应缴企业所得税",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ24",
                "name": "提取专用基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              },
              {
                "level": "item",
                "tag": "EG10BJ25",
                "name": "转入事业基金",
                "occurrence": "[1..1]",
                "type": "uInt..15",
                "length": "≤15",
                "required": "必含",
                "requiredCode": "M",
                "remark": "",
                "domain": "财务与评级",
                "children": []
              }
            ]
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EHA",
    "name": "评级信息",
    "occurrence": "[1..1]",
    "domain": "财务与评级",
    "children": [
      {
        "level": "unit",
        "tag": "EH01",
        "name": "评级信息单元",
        "occurrence": "[0..*]",
        "domain": "财务与评级",
        "children": [
          {
            "level": "item",
            "tag": "EH010I01",
            "name": "评级信息编号",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "系统分配给该条评级信息在本报告中的唯一编号。",
            "domain": "财务与评级",
            "children": []
          },
          {
            "level": "item",
            "tag": "EH010Q01",
            "name": "评级机构名称",
            "occurrence": "[1..1]",
            "type": "ANC..80",
            "length": "≤80",
            "required": "必含",
            "requiredCode": "M",
            "remark": "评级机构的名称。",
            "domain": "财务与评级",
            "children": []
          },
          {
            "level": "item",
            "tag": "EH010R01",
            "name": "评级日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "评级的日期。",
            "domain": "财务与评级",
            "children": []
          },
          {
            "level": "item",
            "tag": "EH010D01",
            "name": "评级结果",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表54",
            "domain": "财务与评级",
            "codeTable": {
              "no": "54",
              "name": "评级代码表",
              "entries": [
                {
                  "code": "A0",
                  "name": "A",
                  "desc": ""
                },
                {
                  "code": "A1",
                  "name": "A",
                  "desc": ""
                },
                {
                  "code": "A2",
                  "name": "A+",
                  "desc": ""
                },
                {
                  "code": "A3",
                  "name": "AA",
                  "desc": ""
                },
                {
                  "code": "A4",
                  "name": "AA",
                  "desc": ""
                },
                {
                  "code": "A5",
                  "name": "AA+",
                  "desc": ""
                },
                {
                  "code": "A6",
                  "name": "AAA",
                  "desc": ""
                },
                {
                  "code": "A7",
                  "name": "AAA",
                  "desc": ""
                },
                {
                  "code": "B0",
                  "name": "B",
                  "desc": ""
                },
                {
                  "code": "B1",
                  "name": "B",
                  "desc": ""
                },
                {
                  "code": "B2",
                  "name": "B+",
                  "desc": ""
                },
                {
                  "code": "B3",
                  "name": "BB",
                  "desc": ""
                },
                {
                  "code": "B4",
                  "name": "BB",
                  "desc": ""
                },
                {
                  "code": "B5",
                  "name": "BB+",
                  "desc": ""
                },
                {
                  "code": "B6",
                  "name": "BBB",
                  "desc": ""
                },
                {
                  "code": "B7",
                  "name": "BBB",
                  "desc": ""
                },
                {
                  "code": "B8",
                  "name": "BBB+",
                  "desc": ""
                },
                {
                  "code": "C0",
                  "name": "C",
                  "desc": ""
                },
                {
                  "code": "C1",
                  "name": "C+",
                  "desc": ""
                },
                {
                  "code": "C2",
                  "name": "CC",
                  "desc": ""
                },
                {
                  "code": "C3",
                  "name": "CC",
                  "desc": ""
                },
                {
                  "code": "C4",
                  "name": "CC+",
                  "desc": ""
                },
                {
                  "code": "C5",
                  "name": "CCC",
                  "desc": ""
                },
                {
                  "code": "C6",
                  "name": "CCC",
                  "desc": ""
                },
                {
                  "code": "C7",
                  "name": "CCC+",
                  "desc": ""
                }
              ]
            },
            "children": []
          }
        ]
      }
    ]
  },
  {
    "level": "block",
    "tag": "EIA",
    "name": "声明及标注信息",
    "occurrence": "[1..1]",
    "domain": "声明与标注",
    "children": [
      {
        "level": "unit",
        "tag": "EI01",
        "name": "声明及异议标注信息单元",
        "occurrence": "[0..*]",
        "domain": "声明与标注",
        "children": [
          {
            "level": "item",
            "tag": "EI010D01",
            "name": "对象类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表65",
            "domain": "声明与标注",
            "codeTable": {
              "no": "65",
              "name": "声明及异议标注对象类型代码表",
              "entries": [
                {
                  "code": "A00",
                  "name": "报告",
                  "desc": ""
                },
                {
                  "code": "C01",
                  "name": "基本概况信息单元",
                  "desc": ""
                },
                {
                  "code": "C02",
                  "name": "注册资本及主要出资人信息单元",
                  "desc": ""
                },
                {
                  "code": "C03",
                  "name": "主要组成人员信息单元",
                  "desc": ""
                },
                {
                  "code": "C04",
                  "name": "上级机构信息单元",
                  "desc": ""
                },
                {
                  "code": "C05",
                  "name": "实际控制人信息单元",
                  "desc": ""
                },
                {
                  "code": "D01",
                  "name": "借贷账户信息单元",
                  "desc": ""
                },
                {
                  "code": "D03",
                  "name": "欠息信息单元",
                  "desc": ""
                },
                {
                  "code": "D04",
                  "name": "担保账户信息单元",
                  "desc": ""
                },
                {
                  "code": "D06",
                  "name": "授信协议信息单元",
                  "desc": ""
                },
                {
                  "code": "D07",
                  "name": "相关还款责任借贷账户（不含贴现）信息单元",
                  "desc": ""
                },
                {
                  "code": "D08",
                  "name": "相关还款责任贴现账户信息单元",
                  "desc": ""
                },
                {
                  "code": "D09",
                  "name": "相关还款责任担保账户信息单元",
                  "desc": ""
                },
                {
                  "code": "E01",
                  "name": "公用事业缴费信息",
                  "desc": ""
                },
                {
                  "code": "F01",
                  "name": "欠税记录信息单元",
                  "desc": ""
                },
                {
                  "code": "F02",
                  "name": "民事判决信息单元",
                  "desc": ""
                },
                {
                  "code": "F03",
                  "name": "强制执行信息单元",
                  "desc": ""
                },
                {
                  "code": "F04",
                  "name": "行政处罚信息单元",
                  "desc": ""
                },
                {
                  "code": "F05",
                  "name": "住房公积金参缴记录信息单元",
                  "desc": ""
                },
                {
                  "code": "F06",
                  "name": "获得许可记录信息单元",
                  "desc": ""
                },
                {
                  "code": "F07",
                  "name": "获得认证记录信息单元",
                  "desc": ""
                },
                {
                  "code": "F08",
                  "name": "获得资质记录信息单元",
                  "desc": ""
                },
                {
                  "code": "F09",
                  "name": "获得奖励记录信息单元",
                  "desc": ""
                },
                {
                  "code": "F10",
                  "name": "出入境检验检疫绿色通道信息单元",
                  "desc": ""
                },
                {
                  "code": "F11",
                  "name": "进出口商品免验信息单元",
                  "desc": ""
                },
                {
                  "code": "F12",
                  "name": "进出口商品检验分类监管信息单元",
                  "desc": ""
                },
                {
                  "code": "F13",
                  "name": "拥有专利情况信息单元",
                  "desc": ""
                },
                {
                  "code": "F14",
                  "name": "融资规模控制信息单元",
                  "desc": ""
                },
                {
                  "code": "H01",
                  "name": "评级信息单元",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EI010I01",
            "name": "对象标识",
            "occurrence": "[1..1]",
            "type": "AN..6",
            "length": "≤6",
            "required": "必含",
            "requiredCode": "M",
            "remark": "当标注对象为报告和基本信息时，此数据项返回空值。 当标注对象为报告和基本信息外的其他信息单元时，此数据项 返回信息单元中的对象编号（账户编号/授信协议编号/…）。",
            "domain": "声明与标注",
            "children": []
          },
          {
            "level": "item",
            "tag": "EI010D02",
            "name": "标注及声明类型",
            "occurrence": "[1..1]",
            "type": "Enum",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "码表66",
            "domain": "声明与标注",
            "codeTable": {
              "no": "66",
              "name": "标注及声明类型代码表",
              "entries": [
                {
                  "code": "1",
                  "name": "数据提供机构说明",
                  "desc": ""
                },
                {
                  "code": "2",
                  "name": "征信中心说明",
                  "desc": ""
                },
                {
                  "code": "3",
                  "name": "信息主体声明",
                  "desc": ""
                },
                {
                  "code": "4",
                  "name": "异议标注",
                  "desc": ""
                }
              ]
            },
            "children": []
          },
          {
            "level": "item",
            "tag": "EI010Q01",
            "name": "标注或声明内容",
            "occurrence": "[1..1]",
            "type": "ANC..200",
            "length": "≤200",
            "required": "必含",
            "requiredCode": "M",
            "remark": "异议标注或声明信息的内容。",
            "domain": "声明与标注",
            "children": []
          },
          {
            "level": "item",
            "tag": "EI010R01",
            "name": "添加日期",
            "occurrence": "[1..1]",
            "type": "Date",
            "length": "—",
            "required": "必含",
            "requiredCode": "M",
            "remark": "标注或声明的添加日期。",
            "domain": "声明与标注",
            "children": []
          }
        ]
      }
    ]
  }
]

export const CREDIT_VERSION: CreditVersion[] = [
  {
    "version": "版本",
    "change": "变更内容",
    "time": "时间",
    "note": "备注"
  },
  {
    "version": "V1.0",
    "change": "新增",
    "time": "5/21/21",
    "note": ""
  },
  {
    "version": "V2.0",
    "change": "修改码表 1)\"证券类融资\"新增\"30-融资融券业务\" 2)\"还款形式\"新增\"71-强制平仓\"",
    "time": "11/3/21",
    "note": ""
  },
  {
    "version": "V3.0",
    "change": "1.表24.企业借贷业务种类细分代码表（贷款） 新增“18-创业担保贷款”。 2.表36.个人借贷业务种类细分代码表 新增“42-个人创业担保贷款”。 3.表2.企业身份标识类型代码表 新增“11-机构信用代码”。 4.表51.公用事业业务类型代码表 “1-电信；2-公用事业”调整为“00-电信缴费；01-电费信息；02-水费信息；03-燃气费信息；04-有线电视收视费；99-其他” 5.报告头信息单元 企业身份信息（XML Tag 为 EA01CH），标签的出现次数从[0..99]调整为[0..*]。 6.注册资本及主要出资人信息单元 出资人信息（XML Tag 为 EC020H），标签的出现次数从[0..99]调整为[0..*]。 7.主要组成人员信息单元 主要组成人员信息（XML Tag 为 EC030H），标签的出现次数从[0..99]调整为[0..*]。 8.实际控制人信息单元 实际控制人信息（XML Tag 为 EC050H），标签的出现次数从[0..99]调整为[0..*]。 9.基本概况信息单元 “登记地址”的数据类型“ANC..80”调整为“ANC..100”。 10.借贷账户信息单元 10.1.“逾期总额”、“逾期本金”、“逾期月数”适用借贷账户从“D1/R1/R4”调整为“D1/D2/R1/R4”。 10.2.“共同借款标识”适用借贷账户从“D1/R1/R4”调整为“所有”，ED01AD11 的出现次数从“[0..1]”调整为“[1..1]”。 11.对数据项标签返回空值的情况进行补充 11.1.借贷账户信息单元中，当“账户活动状态”为已结清时，“担保方式”、“发放形式”、“其他还款保证方式”、“授信协议编号”、基本信息段中的“信息报告日期”的数据项标签返回空值。 11.2.担保账户信息单元中，当“账户活动状态”为未结清时，“代偿（垫款）标志”的数据项标签返回空值。当“账户活动状态”为已结清时，“反担保方式”、“其他还款保证方式”、“保证金比例”、“余额”、“风险敞口”、“信息报告日期”、“授信协议编号”的数据项标签返回空值。",
    "time": "9/7/22",
    "note": ""
  },
  {
    "version": "V4.0",
    "change": "表19.相关还款责任类型代码表 增加“6-专业担保机构”",
    "time": "3/1/23",
    "note": ""
  },
  {
    "version": "V5.0",
    "change": "1.表43.“特定交易类型”代码表： 新增“13-无还本续贷” 2.表40.“贷款发放形式”代码表： 新增“6-无还本续贷” 3.表37.“（反）担保方式”代码表： 将代码“0-信用/免担保”的中文名称调整为“0-信用/无担保” 4.表47“个人借贷账户还款状态代码表（D1/R4账户）”、A.48“个人借贷账户还款状态代码表（R1账户）”代码表：将代码“D-担保人代还（表示借款人当前欠款已由担保人代还，账户当前没有逾期，包括全部由担保人代还与部分由担保人部分代还）”的中文名称调整为“D-担保人（第三方）代偿（表示借款人当前欠款已由担保人（第三方）代偿，账户当前没有逾期，包括全部由担保人（第三方）代偿与由担保人（第三方）部分代偿两种情况）”。",
    "time": "4/3/23",
    "note": ""
  }
]

export const CREDIT_CODE_TABLES: CreditCodeTable[] = [
  {
    "no": "1",
    "name": "身份类别代码表",
    "entries": [
      {
        "code": "1",
        "name": "自然人",
        "desc": ""
      },
      {
        "code": "2",
        "name": "组织机构",
        "desc": ""
      }
    ]
  },
  {
    "no": "2",
    "name": "企业身份标识类型代码表",
    "entries": [
      {
        "code": "10",
        "name": "中征码",
        "desc": "一代中的“原贷款卡编码”对应此代码。"
      },
      {
        "code": "20",
        "name": "统一社会信用代码",
        "desc": ""
      },
      {
        "code": "30",
        "name": "组织机构代码",
        "desc": ""
      },
      {
        "code": "01",
        "name": "工商注册号",
        "desc": ""
      },
      {
        "code": "02",
        "name": "事业单位证书号",
        "desc": ""
      },
      {
        "code": "03",
        "name": "社会团体登记号",
        "desc": ""
      },
      {
        "code": "04",
        "name": "民办非企业登记号",
        "desc": ""
      },
      {
        "code": "05",
        "name": "基金会登记号",
        "desc": ""
      },
      {
        "code": "06",
        "name": "宗教证书登记号",
        "desc": ""
      },
      {
        "code": "11",
        "name": "机构信用代码",
        "desc": ""
      },
      {
        "code": "41",
        "name": "纳税人识别号（国税）",
        "desc": ""
      },
      {
        "code": "42",
        "name": "纳税人识别号（地税）",
        "desc": ""
      }
    ]
  },
  {
    "no": "3",
    "name": "个人证件类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "户口簿",
        "desc": ""
      },
      {
        "code": "2",
        "name": "护照",
        "desc": ""
      },
      {
        "code": "5",
        "name": "港澳居民来往内地通行证",
        "desc": ""
      },
      {
        "code": "6",
        "name": "台湾同胞来往内地通行证",
        "desc": ""
      },
      {
        "code": "8",
        "name": "外国人居留证",
        "desc": ""
      },
      {
        "code": "9",
        "name": "警官证",
        "desc": ""
      },
      {
        "code": "A",
        "name": "香港身份证",
        "desc": ""
      },
      {
        "code": "B",
        "name": "澳门身份证",
        "desc": ""
      },
      {
        "code": "C",
        "name": "台湾身份证",
        "desc": ""
      },
      {
        "code": "X",
        "name": "其他证件",
        "desc": ""
      },
      {
        "code": "10",
        "name": "身份证",
        "desc": "居民身份证及其他以公民身份证号为标识的证件。 一代中的“0-身份证”、 “7-临时身份证” 均对应 此代码。"
      },
      {
        "code": "20",
        "name": "军人身份证件",
        "desc": "一代中的“军官证”、“士兵证”均对应此代码。"
      }
    ]
  },
  {
    "no": "4",
    "name": "查询原因代码表",
    "entries": [
      {
        "code": "01",
        "name": "贷前（保前）审查",
        "desc": ""
      },
      {
        "code": "02",
        "name": "贷中操作",
        "desc": ""
      },
      {
        "code": "03",
        "name": "贷后（在保） 管理",
        "desc": ""
      },
      {
        "code": "04",
        "name": "其他原因",
        "desc": ""
      },
      {
        "code": "05",
        "name": "关联查询",
        "desc": ""
      },
      {
        "code": "17",
        "name": "额度审批",
        "desc": ""
      },
      {
        "code": "18",
        "name": "担保审查",
        "desc": ""
      }
    ]
  },
  {
    "no": "5",
    "name": "企业规模代码表",
    "entries": [
      {
        "code": "2",
        "name": "大型企业",
        "desc": "参照工业和信息化部、国家统计局、发展改革委、财政部联合印发的《关于印发中小企业划型标准规定的通知》（工信部联企业〔2011〕 300 号）执行。"
      },
      {
        "code": "3",
        "name": "中型企业",
        "desc": ""
      },
      {
        "code": "4",
        "name": "小型企业",
        "desc": ""
      },
      {
        "code": "5",
        "name": "微型企业",
        "desc": ""
      },
      {
        "code": "9",
        "name": "无需划型",
        "desc": "适用于企业分支机构以及机关、事业单位等无需划分规模的组织。"
      },
      {
        "code": "X",
        "name": "未知",
        "desc": "适用于无法获取规模的企业。"
      }
    ]
  },
  {
    "no": "6",
    "name": "存续状态代码表",
    "entries": [
      {
        "code": "1",
        "name": "正常营业",
        "desc": "处于正常经营状态"
      },
      {
        "code": "2",
        "name": "注销",
        "desc": ""
      },
      {
        "code": "9",
        "name": "其他",
        "desc": ""
      },
      {
        "code": "X",
        "name": "未知",
        "desc": "无法获得企业存续状态的情况"
      }
    ]
  },
  {
    "no": "7",
    "name": "出资人类型代码表",
    "entries": [
      {
        "code": "10",
        "name": "股东",
        "desc": ""
      },
      {
        "code": "21",
        "name": "普通合伙人",
        "desc": ""
      },
      {
        "code": "22",
        "name": "有限合伙人",
        "desc": ""
      },
      {
        "code": "30",
        "name": "个体工商户参与经营者",
        "desc": ""
      }
    ]
  },
  {
    "no": "8",
    "name": "职位代码表",
    "entries": [
      {
        "code": "1",
        "name": "法定代表人/非法人组织负责人",
        "desc": ""
      },
      {
        "code": "2",
        "name": "总经理/主要负责人",
        "desc": ""
      },
      {
        "code": "3",
        "name": "财务负责人",
        "desc": ""
      },
      {
        "code": "4",
        "name": "董事长/执行董事",
        "desc": ""
      },
      {
        "code": "5",
        "name": "监事长/执行监事",
        "desc": ""
      },
      {
        "code": "9",
        "name": "其他董事、监事及高级管理人员",
        "desc": ""
      }
    ]
  },
  {
    "no": "9",
    "name": "上级机构类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "集团母公司",
        "desc": ""
      },
      {
        "code": "2",
        "name": "总部机构",
        "desc": ""
      }
    ]
  },
  {
    "no": "10",
    "name": "账户活动状态代码表",
    "entries": [
      {
        "code": "1",
        "name": "未结清",
        "desc": ""
      },
      {
        "code": "2",
        "name": "已结清",
        "desc": ""
      }
    ]
  },
  {
    "no": "11",
    "name": "企业借贷账户类型代码表",
    "entries": [
      {
        "code": "D1",
        "name": "非循环贷账户",
        "desc": "用于描述授信额度不可循环的借贷业务，包 括一次性放款的非循环贷业务和分次放款的 非循环贷业务。"
      },
      {
        "code": "D2",
        "name": "贴现账户",
        "desc": "用来描述票据贴现类业务。"
      },
      {
        "code": "R1",
        "name": "循环贷账户",
        "desc": "用于描述循环授信额度下还款统一管理（即 借款人统一还款）的借贷业务，也可用于汇 总报送循环额度下逐笔管理的所有借贷业 务。"
      },
      {
        "code": "R4",
        "name": "循环额度下分账户",
        "desc": "用于描述循环授信额度下逐笔管理（即需要 针对每一笔借款分开还款）的借贷业务。"
      },
      {
        "code": "C1",
        "name": "催收账户",
        "desc": "用于描述剩余本息处于催收状态（即债权人 要求债务人尽快归还全部借款）的借贷业 务。"
      }
    ]
  },
  {
    "no": "12",
    "name": "企业担保账户类型代码表",
    "entries": [
      {
        "code": "G1",
        "name": "融资担保账户",
        "desc": "用于描述银行保函、贷款保证保险、融资担 保合同等融资担保工具。"
      },
      {
        "code": "G2",
        "name": "非融资担保账户",
        "desc": "用于描述诉讼保全担保、履约担保等非融资 担保工具。"
      },
      {
        "code": "G3",
        "name": "支付担保账户",
        "desc": "用于描述银行承兑汇票、信用证等有银行信 用背书的支付工具。"
      }
    ]
  },
  {
    "no": "13",
    "name": "代偿（垫款）标志代码表",
    "entries": [
      {
        "code": "0",
        "name": "否",
        "desc": "如果账户未结清，返回空值。"
      },
      {
        "code": "1",
        "name": "是",
        "desc": ""
      }
    ]
  },
  {
    "no": "14",
    "name": "个人借贷账户类型代码表",
    "entries": [
      {
        "code": "D1",
        "name": "非循环贷账户",
        "desc": "用于描述非循环贷款。按照贷款发放次数，非循环贷款可以分为一次性放款和分次放款。"
      },
      {
        "code": "R1",
        "name": "循环贷账户",
        "desc": "用于描述循环额度下还款统一管理（即每月根据当前累计借款余额计算出一个还款金额通知借款人）的贷款，也可用于汇总报送循环授信额度下逐笔管理的所有贷款。"
      },
      {
        "code": "R2",
        "name": "贷记卡账户",
        "desc": "用于记录借款人使用贷记卡类产品的透支及还款行为。"
      },
      {
        "code": "R3",
        "name": "准贷记卡账户",
        "desc": "用于记录借款人使用准贷记卡类产品的透支及还款行为。"
      },
      {
        "code": "R4",
        "name": "循环额度下分账户",
        "desc": "用于描述循环授信额度下逐笔管理（即需要针对每一笔借款分开归还）的贷款。 特定情形下，应合并报送。"
      },
      {
        "code": "C1",
        "name": "催收账户",
        "desc": "用于描述剩余本息均处于催收状态的借款。 催收账户不再关注与到期和逾期相关的指标。"
      }
    ]
  },
  {
    "no": "15",
    "name": "企业借贷交易业务类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "中长期借款",
        "desc": "对应于借款期限为中期和长期 的 D1 和 R4类账户。"
      },
      {
        "code": "2",
        "name": "短期借款",
        "desc": "对应于借款期限为短期的 D1和 R4 类账户。"
      },
      {
        "code": "3",
        "name": "循环透支",
        "desc": "对应于 R1 账户。"
      },
      {
        "code": "4",
        "name": "贴现",
        "desc": "对应于 D2 账户。"
      },
      {
        "code": "0",
        "name": "合计",
        "desc": "中长期借款、短期借款、循环透支和贴现业务的汇总。"
      }
    ]
  },
  {
    "no": "16",
    "name": "企业担保交易业务类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "银行承兑汇票",
        "desc": ""
      },
      {
        "code": "2",
        "name": "信用证",
        "desc": ""
      },
      {
        "code": "3",
        "name": "银行保函",
        "desc": ""
      },
      {
        "code": "9",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "17",
    "name": "资产质量分类代码表",
    "entries": [
      {
        "code": "1",
        "name": "正常类",
        "desc": "五级分类为正常，或五级分类为“未分类”且没有逾期。"
      },
      {
        "code": "2",
        "name": "关注类",
        "desc": "五级分类为关注， 或者五级分类为“未分”且逾期不超过90天。"
      },
      {
        "code": "3",
        "name": "不良类",
        "desc": "五级分类为次级、可疑、损失、违约， 或五级分类为“未分类”且逾期 90天以上。"
      },
      {
        "code": "0",
        "name": "合计",
        "desc": "以上各类的汇总"
      }
    ]
  },
  {
    "no": "18",
    "name": "是否包含授信限额代码表",
    "entries": [
      {
        "code": "0",
        "name": "否",
        "desc": "汇总中不包含授信限额的情况。"
      },
      {
        "code": "1",
        "name": "是",
        "desc": "汇总中包含授信限额的情况。"
      }
    ]
  },
  {
    "no": "19",
    "name": "相关还款责任类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "个人信贷交易共同还款人/共同债务人",
        "desc": ""
      },
      {
        "code": "2",
        "name": "保证人/反担保人",
        "desc": ""
      },
      {
        "code": "3",
        "name": "票据承兑人",
        "desc": ""
      },
      {
        "code": "4",
        "name": "应收账款债务人",
        "desc": ""
      },
      {
        "code": "5",
        "name": "供应链中核心企业",
        "desc": ""
      },
      {
        "code": "6",
        "name": "专业担保机构",
        "desc": ""
      },
      {
        "code": "9",
        "name": "其他",
        "desc": "在相关还款责任汇总信息单元中，“9-其他”对应的是“3-票据承兑人”、“4-应收账款债务人”、“5-供应链核心企业”、“9-其他”情况汇总。"
      },
      {
        "code": "0",
        "name": "合计",
        "desc": "对 1、 2、 9 情况的汇总。"
      }
    ]
  },
  {
    "no": "20",
    "name": "借款期限分类代码表",
    "entries": [
      {
        "code": "10",
        "name": "短期",
        "desc": "借款期限1年以内（含 1年）。"
      },
      {
        "code": "20",
        "name": "中期",
        "desc": "借款期限1年以上5年（含）以下。"
      },
      {
        "code": "30",
        "name": "长期",
        "desc": "借款期限5年（不含）以上的借款。"
      }
    ]
  },
  {
    "no": "21",
    "name": "业务管理机构类型代码表",
    "entries": [
      {
        "code": "11",
        "name": "商业银行",
        "desc": ""
      },
      {
        "code": "12",
        "name": "村镇银行",
        "desc": ""
      },
      {
        "code": "14",
        "name": "住房储蓄银行",
        "desc": ""
      },
      {
        "code": "15",
        "name": "外资银行",
        "desc": ""
      },
      {
        "code": "16",
        "name": "财务公司",
        "desc": ""
      },
      {
        "code": "21",
        "name": "信托公司",
        "desc": ""
      },
      {
        "code": "22",
        "name": "融资租赁公司",
        "desc": ""
      },
      {
        "code": "23",
        "name": "汽车金融公司",
        "desc": ""
      },
      {
        "code": "24",
        "name": "消费金融公司",
        "desc": ""
      },
      {
        "code": "25",
        "name": "贷款公司",
        "desc": ""
      },
      {
        "code": "26",
        "name": "金融资产管理公司",
        "desc": ""
      },
      {
        "code": "31",
        "name": "证券公司",
        "desc": ""
      },
      {
        "code": "41",
        "name": "保险公司",
        "desc": ""
      },
      {
        "code": "51",
        "name": "小额贷款公司",
        "desc": ""
      },
      {
        "code": "52",
        "name": "公积金管理中心",
        "desc": ""
      },
      {
        "code": "53",
        "name": "融资性担保公司",
        "desc": ""
      },
      {
        "code": "54",
        "name": "保理公司",
        "desc": ""
      },
      {
        "code": "99",
        "name": "其他机构",
        "desc": ""
      }
    ]
  },
  {
    "no": "22",
    "name": "企业借贷业务大类代码表",
    "entries": [
      {
        "code": "10",
        "name": "企业债",
        "desc": ""
      },
      {
        "code": "11",
        "name": "贷款",
        "desc": ""
      },
      {
        "code": "12",
        "name": "贸易融资",
        "desc": ""
      },
      {
        "code": "13",
        "name": "保理融资",
        "desc": ""
      },
      {
        "code": "14",
        "name": "融资租赁",
        "desc": ""
      },
      {
        "code": "15",
        "name": "证券类融资",
        "desc": ""
      },
      {
        "code": "16",
        "name": "透支",
        "desc": ""
      },
      {
        "code": "21",
        "name": "票据贴现",
        "desc": ""
      },
      {
        "code": "31",
        "name": "黄金借贷",
        "desc": ""
      },
      {
        "code": "41",
        "name": "垫款",
        "desc": ""
      },
      {
        "code": "51",
        "name": "资产处置",
        "desc": ""
      }
    ]
  },
  {
    "no": "23",
    "name": "企业借贷业务种类细分代码表（企业债）",
    "entries": [
      {
        "code": "10",
        "name": "非金融企业债务融资工具",
        "desc": ""
      },
      {
        "code": "20",
        "name": "上市公司债",
        "desc": ""
      },
      {
        "code": "30",
        "name": "发改委审核发行企业债",
        "desc": ""
      },
      {
        "code": "90",
        "name": "其他公司信用债",
        "desc": ""
      }
    ]
  },
  {
    "no": "24",
    "name": "企业借贷业务种类细分代码表（贷款）",
    "entries": [
      {
        "code": "11",
        "name": "流动资金贷款",
        "desc": ""
      },
      {
        "code": "12",
        "name": "固定资产贷款",
        "desc": ""
      },
      {
        "code": "13",
        "name": "境外筹资转贷",
        "desc": ""
      },
      {
        "code": "14",
        "name": "国内买方信贷",
        "desc": ""
      },
      {
        "code": "15",
        "name": "出口卖方信贷",
        "desc": ""
      },
      {
        "code": "16",
        "name": "项目融资",
        "desc": ""
      },
      {
        "code": "17",
        "name": "并购贷款",
        "desc": ""
      },
      {
        "code": "18",
        "name": "创业担保贷款",
        "desc": ""
      },
      {
        "code": "90",
        "name": "其他贷款",
        "desc": ""
      }
    ]
  },
  {
    "no": "25",
    "name": "企业借贷业务种类细分代码表（贸易融资）",
    "entries": [
      {
        "code": "10",
        "name": "进口类",
        "desc": ""
      },
      {
        "code": "11",
        "name": "进口押汇",
        "desc": ""
      },
      {
        "code": "19",
        "name": "其他进口类融资",
        "desc": ""
      },
      {
        "code": "20",
        "name": "出口类",
        "desc": ""
      },
      {
        "code": "21",
        "name": "出口打包放款",
        "desc": ""
      },
      {
        "code": "22",
        "name": "出口押汇",
        "desc": ""
      },
      {
        "code": "23",
        "name": "出口票据贴现",
        "desc": ""
      },
      {
        "code": "25",
        "name": "国际订单融资",
        "desc": ""
      },
      {
        "code": "29",
        "name": "其他出口类融资",
        "desc": "不含保理。"
      },
      {
        "code": "31",
        "name": "国内买方押汇",
        "desc": ""
      },
      {
        "code": "39",
        "name": "其他国内买方融资",
        "desc": ""
      },
      {
        "code": "41",
        "name": "国内打包贷款",
        "desc": ""
      },
      {
        "code": "42",
        "name": "国内订单融资",
        "desc": ""
      },
      {
        "code": "43",
        "name": "国内卖方押汇",
        "desc": ""
      },
      {
        "code": "49",
        "name": "其他国内卖方融资",
        "desc": "不含保理。"
      }
    ]
  },
  {
    "no": "26",
    "name": "企业借贷业务种类细分代码表（保理融资）",
    "entries": [
      {
        "code": "10",
        "name": "有追索权的出口保理融资",
        "desc": ""
      },
      {
        "code": "20",
        "name": "有追索权的国内卖方保理融资",
        "desc": ""
      }
    ]
  },
  {
    "no": "27",
    "name": "企业借贷业务种类细分代码表（融资租赁）",
    "entries": [
      {
        "code": "10",
        "name": "融资型租赁",
        "desc": ""
      }
    ]
  },
  {
    "no": "28",
    "name": "企业借贷业务种类细分代码表（证券类融资）",
    "entries": [
      {
        "code": "10",
        "name": "约定购回式证券交易",
        "desc": ""
      },
      {
        "code": "20",
        "name": "股票质押融资",
        "desc": ""
      },
      {
        "code": "30",
        "name": "融资融券业务",
        "desc": ""
      },
      {
        "code": "90",
        "name": "其他证券类融资",
        "desc": ""
      }
    ]
  },
  {
    "no": "29",
    "name": "企业借贷业务种类细分代码表（透支）",
    "entries": [
      {
        "code": "10",
        "name": "法人账户透支",
        "desc": ""
      },
      {
        "code": "20",
        "name": "支票账户透支",
        "desc": ""
      }
    ]
  },
  {
    "no": "30",
    "name": "企业借贷业务种类细分代码表（票据贴现）",
    "entries": [
      {
        "code": "10",
        "name": "有追索权的银行承兑汇票贴现",
        "desc": ""
      },
      {
        "code": "20",
        "name": "有追索权的商业承兑汇票贴现",
        "desc": ""
      }
    ]
  },
  {
    "no": "31",
    "name": "企业借贷业务种类细分代码表（黄金借贷）",
    "entries": [
      {
        "code": "10",
        "name": "黄金借贷",
        "desc": ""
      }
    ]
  },
  {
    "no": "32",
    "name": "企业借贷业务种类细分代码表（垫款）",
    "entries": [
      {
        "code": "10",
        "name": "保函垫款",
        "desc": ""
      },
      {
        "code": "20",
        "name": "承兑汇票垫款",
        "desc": ""
      },
      {
        "code": "30",
        "name": "信用证垫款",
        "desc": ""
      },
      {
        "code": "40",
        "name": "保理垫款",
        "desc": ""
      },
      {
        "code": "50",
        "name": "担保代偿",
        "desc": ""
      },
      {
        "code": "90",
        "name": "其他垫款",
        "desc": ""
      }
    ]
  },
  {
    "no": "33",
    "name": "企业借贷业务种类细分代码表（资产处置）",
    "entries": [
      {
        "code": "10",
        "name": "资产处置",
        "desc": ""
      }
    ]
  },
  {
    "no": "34",
    "name": "担保业务种类细分代码表",
    "entries": [
      {
        "code": "01",
        "name": "贷款担保",
        "desc": "所属业务大类为融资担保，适用于融资性担保公司。"
      },
      {
        "code": "02",
        "name": "票据承兑担保",
        "desc": ""
      },
      {
        "code": "03",
        "name": "贸易融资担保",
        "desc": ""
      },
      {
        "code": "04",
        "name": "项目融资担保",
        "desc": ""
      },
      {
        "code": "05",
        "name": "信用证融资担保",
        "desc": ""
      },
      {
        "code": "06",
        "name": "其他融资性担保",
        "desc": ""
      },
      {
        "code": "10",
        "name": "债券发行担保",
        "desc": ""
      },
      {
        "code": "07",
        "name": "诉讼保全担保",
        "desc": "所属业务大类为非融资担保。"
      },
      {
        "code": "08",
        "name": "履约担保",
        "desc": ""
      },
      {
        "code": "09",
        "name": "非融资担保",
        "desc": ""
      },
      {
        "code": "11",
        "name": "再担保",
        "desc": ""
      },
      {
        "code": "12",
        "name": "贷款保证保险",
        "desc": ""
      },
      {
        "code": "13",
        "name": "个人消费信用保证保险",
        "desc": "仅适用于相关还款责任担保账户分机构汇总信息中的业务种类细分。"
      },
      {
        "code": "51",
        "name": "信用证",
        "desc": ""
      },
      {
        "code": "61",
        "name": "银行承兑汇票",
        "desc": ""
      },
      {
        "code": "62",
        "name": "商业承兑汇票",
        "desc": ""
      },
      {
        "code": "71",
        "name": "融资类银行保函",
        "desc": ""
      },
      {
        "code": "72",
        "name": "非融资类银行保函",
        "desc": ""
      }
    ]
  },
  {
    "no": "35",
    "name": "个人借贷业务大类代码表",
    "entries": [
      {
        "code": "1",
        "name": "贷款",
        "desc": ""
      },
      {
        "code": "2",
        "name": "信用卡",
        "desc": ""
      },
      {
        "code": "3",
        "name": "证券类融资",
        "desc": ""
      },
      {
        "code": "4",
        "name": "融资租赁",
        "desc": ""
      },
      {
        "code": "5",
        "name": "资产处置",
        "desc": ""
      },
      {
        "code": "6",
        "name": "垫款",
        "desc": ""
      }
    ]
  },
  {
    "no": "36",
    "name": "个人借贷业务种类细分代码表",
    "entries": [
      {
        "code": "11",
        "name": "个人住房商业贷款",
        "desc": "所属业务大类为贷款。"
      },
      {
        "code": "12",
        "name": "个人商用房（含商住两用） 贷款",
        "desc": ""
      },
      {
        "code": "13",
        "name": "个人住房公积金贷款",
        "desc": ""
      },
      {
        "code": "21",
        "name": "个人汽车消费贷款",
        "desc": ""
      },
      {
        "code": "31",
        "name": "个人助学贷款",
        "desc": ""
      },
      {
        "code": "32",
        "name": "国家助学贷款",
        "desc": ""
      },
      {
        "code": "33",
        "name": "商业助学贷款",
        "desc": ""
      },
      {
        "code": "41",
        "name": "个人经营性贷款",
        "desc": ""
      },
      {
        "code": "42",
        "name": "个人创业担保贷款",
        "desc": ""
      },
      {
        "code": "51",
        "name": "农户贷款",
        "desc": ""
      },
      {
        "code": "52",
        "name": "经营性农户贷款",
        "desc": ""
      },
      {
        "code": "53",
        "name": "消费性农户贷款",
        "desc": ""
      },
      {
        "code": "91",
        "name": "其他个人消费贷款",
        "desc": ""
      },
      {
        "code": "99",
        "name": "其他贷款",
        "desc": ""
      },
      {
        "code": "71",
        "name": "准贷记卡",
        "desc": "所属业务大类为信用卡。"
      },
      {
        "code": "81",
        "name": "贷记卡",
        "desc": ""
      },
      {
        "code": "82",
        "name": "大额专项分期卡",
        "desc": ""
      },
      {
        "code": "61",
        "name": "约定购回式证券交易",
        "desc": ""
      },
      {
        "code": "62",
        "name": "股票质押式回购交易",
        "desc": "所属业务大类为证券类融 资。"
      },
      {
        "code": "63",
        "name": "融资融券业务",
        "desc": ""
      },
      {
        "code": "64",
        "name": "其他证券类融资",
        "desc": ""
      },
      {
        "code": "92",
        "name": "融资租赁业务",
        "desc": "所属业务大类为融资租赁。"
      },
      {
        "code": "A1",
        "name": "资产处置",
        "desc": "由资产处置机构催收的债务，所属业务大类为资产处置。"
      },
      {
        "code": "B1",
        "name": "代偿债务",
        "desc": "因代偿继承债权的债务，所属业务大类为垫款。"
      }
    ]
  },
  {
    "no": "37",
    "name": "（反）担保方式代码表",
    "entries": [
      {
        "code": "0",
        "name": "信用/无担保",
        "desc": "如果账户已结清，返回空值。"
      },
      {
        "code": "1",
        "name": "保证",
        "desc": ""
      },
      {
        "code": "2",
        "name": "质押",
        "desc": ""
      },
      {
        "code": "3",
        "name": "抵押",
        "desc": ""
      },
      {
        "code": "4",
        "name": "组合",
        "desc": ""
      }
    ]
  },
  {
    "no": "38",
    "name": "其他还款保证方式代码表",
    "entries": [
      {
        "code": "0",
        "name": "无",
        "desc": "如果账户已结清，返回空值。"
      },
      {
        "code": "1",
        "name": "保证金",
        "desc": ""
      },
      {
        "code": "2",
        "name": "第三方付款承诺",
        "desc": ""
      },
      {
        "code": "9",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "39",
    "name": "授信额度类型代码表",
    "entries": [
      {
        "code": "11",
        "name": "贷款",
        "desc": ""
      },
      {
        "code": "12",
        "name": "贸易融资",
        "desc": ""
      },
      {
        "code": "13",
        "name": "保理融资",
        "desc": ""
      },
      {
        "code": "15",
        "name": "证券类融资",
        "desc": ""
      },
      {
        "code": "16",
        "name": "透支",
        "desc": ""
      },
      {
        "code": "31",
        "name": "黄金借贷",
        "desc": ""
      },
      {
        "code": "40",
        "name": "融资租赁",
        "desc": ""
      },
      {
        "code": "41",
        "name": "信用证额度",
        "desc": ""
      },
      {
        "code": "51",
        "name": "承兑汇票额度",
        "desc": ""
      }
    ]
  },
  {
    "no": "40",
    "name": "贷款发放形式代码表",
    "entries": [
      {
        "code": "1",
        "name": "新增",
        "desc": "如果账户已结清，返回空值。"
      },
      {
        "code": "2",
        "name": "收回再贷",
        "desc": ""
      },
      {
        "code": "3",
        "name": "借新还旧",
        "desc": ""
      },
      {
        "code": "4",
        "name": "资产重组",
        "desc": ""
      },
      {
        "code": "5",
        "name": "其他机构转入",
        "desc": ""
      },
      {
        "code": "6",
        "name": "无还本续贷",
        "desc": ""
      },
      {
        "code": "9",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "41",
    "name": "共同借款（共同债务） 标识代码表",
    "entries": [
      {
        "code": "0",
        "name": "无共同借款人（债务人）",
        "desc": ""
      },
      {
        "code": "1",
        "name": "有共同借款人（债务人），且本报告主体为主借款人（债务人）",
        "desc": ""
      },
      {
        "code": "2",
        "name": "有共同借款人（债务人） ，且本报告主体为从借款人（债务人）",
        "desc": ""
      }
    ]
  },
  {
    "no": "42",
    "name": "还款形式代码表",
    "entries": [
      {
        "code": "10",
        "name": "正常还款",
        "desc": ""
      },
      {
        "code": "21",
        "name": "担保代偿",
        "desc": ""
      },
      {
        "code": "22",
        "name": "政策性还款",
        "desc": ""
      },
      {
        "code": "31",
        "name": "资产重组",
        "desc": ""
      },
      {
        "code": "32",
        "name": "减免",
        "desc": ""
      },
      {
        "code": "41",
        "name": "债权转让",
        "desc": ""
      },
      {
        "code": "42",
        "name": "债权置换",
        "desc": ""
      },
      {
        "code": "43",
        "name": "资产剥离",
        "desc": ""
      },
      {
        "code": "51",
        "name": "债转股",
        "desc": ""
      },
      {
        "code": "52",
        "name": "以资抵债",
        "desc": ""
      },
      {
        "code": "61",
        "name": "诉讼追偿",
        "desc": ""
      },
      {
        "code": "62",
        "name": "破产清偿",
        "desc": ""
      },
      {
        "code": "63",
        "name": "委托处置",
        "desc": ""
      },
      {
        "code": "71",
        "name": "强制平仓",
        "desc": ""
      },
      {
        "code": "99",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "43",
    "name": "特定交易类型代码表",
    "entries": [
      {
        "code": "11",
        "name": "展期",
        "desc": ""
      },
      {
        "code": "12",
        "name": "提前还款",
        "desc": ""
      },
      {
        "code": "13",
        "name": "无还本续贷",
        "desc": ""
      }
    ]
  },
  {
    "no": "44",
    "name": "欠息类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "表内",
        "desc": ""
      },
      {
        "code": "2",
        "name": "表外",
        "desc": ""
      }
    ]
  },
  {
    "no": "45",
    "name": "五级分类代码表",
    "entries": [
      {
        "code": "1",
        "name": "正常",
        "desc": ""
      },
      {
        "code": "2",
        "name": "关注",
        "desc": ""
      },
      {
        "code": "3",
        "name": "次级",
        "desc": ""
      },
      {
        "code": "4",
        "name": "可疑",
        "desc": ""
      },
      {
        "code": "5",
        "name": "损失",
        "desc": ""
      },
      {
        "code": "6",
        "name": "违约",
        "desc": ""
      },
      {
        "code": "9",
        "name": "未分类",
        "desc": ""
      }
    ]
  },
  {
    "no": "46",
    "name": "额度循环标志代码表",
    "entries": [
      {
        "code": "0",
        "name": "否",
        "desc": ""
      },
      {
        "code": "1",
        "name": "是",
        "desc": ""
      }
    ]
  },
  {
    "no": "47",
    "name": "个人借贷账户还款状态代码表（D1/R4 账户）",
    "entries": [
      {
        "code": "*",
        "name": "当月不需要还款且之前没有拖欠",
        "desc": ""
      },
      {
        "code": "N",
        "name": "正常还款",
        "desc": "表示借款人已经按时归还该月应还款金额的全部，且该账户没有逾期。"
      },
      {
        "code": "D",
        "name": "担保人（第三方）代偿",
        "desc": "表示借款人当前欠款已由担保人代还，账户当前没有逾期，包括全部由担保人代还与部分由担保人部分代还。"
      },
      {
        "code": "Z",
        "name": "以资抵债",
        "desc": "表示借款人当月的欠款已通过以资抵债的方式还款，账户当前没有逾期。"
      },
      {
        "code": "M",
        "name": "约定还款日后月底前还款",
        "desc": "表示截止信息报告日期，借款人已还清所有逾期款项，但是未能在本月的应还日前还清。"
      },
      {
        "code": "1",
        "name": "逾期 1-30 天",
        "desc": ""
      },
      {
        "code": "2",
        "name": "逾期 31-60 天",
        "desc": ""
      },
      {
        "code": "3",
        "name": "逾期 61-90 天",
        "desc": ""
      },
      {
        "code": "4",
        "name": "逾期 91-120 天",
        "desc": ""
      },
      {
        "code": "5",
        "name": "逾期 121-150 天",
        "desc": ""
      },
      {
        "code": "6",
        "name": "逾期 151-180 天",
        "desc": ""
      },
      {
        "code": "7",
        "name": "逾期 180 天以上",
        "desc": ""
      },
      {
        "code": "B",
        "name": "呆账",
        "desc": "长期不还款，具体逾期天数未知。"
      },
      {
        "code": "C",
        "name": "结清",
        "desc": "借款人该笔贷款全部还清，贷款余额为 0。"
      },
      {
        "code": "G",
        "name": "结束",
        "desc": "结清除外，其他形式的债权关系解除，如资产剥离。"
      },
      {
        "code": "#",
        "name": "未知",
        "desc": ""
      }
    ]
  },
  {
    "no": "48",
    "name": "个人借贷账户还款状态代码表（R1 账户）",
    "entries": [
      {
        "code": "*",
        "name": "当月未使用额度且不需要还款",
        "desc": "上月余额为 0，且本月没有新增借款"
      },
      {
        "code": "N",
        "name": "正常还款",
        "desc": "表示该账户没有逾期，包括两种情况：一是借款人已经按时归还该月全部应还款金额；二是按计划当期无须还款且当前余额不为 0。"
      },
      {
        "code": "D",
        "name": "担保人（第三方）代偿",
        "desc": "表示借款人当前欠款已由担保人代还，账户当前没有逾期，包括全部由担保人代还与部分由担保人部分代还。"
      },
      {
        "code": "Z",
        "name": "以资抵债",
        "desc": "表示借款人当月的欠款已通过以资抵债的方式还款，账户当前没有逾期。"
      },
      {
        "code": "M",
        "name": "约定还款日后月底前还款",
        "desc": "表示截止信息报告日期，借款人已还清所有逾期款项，但是未能在本月的应还日前还清。"
      },
      {
        "code": "1",
        "name": "逾期 1-30 天",
        "desc": ""
      },
      {
        "code": "2",
        "name": "逾期 31-60 天",
        "desc": ""
      },
      {
        "code": "3",
        "name": "逾期 61-90 天",
        "desc": ""
      },
      {
        "code": "4",
        "name": "逾期 91-120 天",
        "desc": ""
      },
      {
        "code": "5",
        "name": "逾期 121-150 天",
        "desc": ""
      },
      {
        "code": "6",
        "name": "逾期 151-180 天",
        "desc": ""
      },
      {
        "code": "7",
        "name": "逾期 180 天以上",
        "desc": ""
      },
      {
        "code": "B",
        "name": "呆账",
        "desc": "长期不还款，具体逾期天数未知。"
      },
      {
        "code": "C",
        "name": "正常销户",
        "desc": ""
      },
      {
        "code": "G",
        "name": "结束",
        "desc": "除正常正常销户外，其他形式的债权关系解除，如资产剥离。"
      },
      {
        "code": "#",
        "name": "未知",
        "desc": ""
      }
    ]
  },
  {
    "no": "49",
    "name": "个人借贷账户还款状态代码表（R2 账户）",
    "entries": [
      {
        "code": "*",
        "name": "当月未使用额度且不需要还款",
        "desc": "上期账单余额为 0，且本期没有新增消费。"
      },
      {
        "code": "N",
        "name": "正常还款",
        "desc": "持卡人已还清上一账单周期的最低还款额或用卡后处于免息期内。"
      },
      {
        "code": "A",
        "name": "账单日调整，当月不出单",
        "desc": ""
      },
      {
        "code": "1",
        "name": "逾期 1-30 天",
        "desc": ""
      },
      {
        "code": "2",
        "name": "逾期 31-60 天",
        "desc": ""
      },
      {
        "code": "3",
        "name": "逾期 61-90 天",
        "desc": ""
      },
      {
        "code": "4",
        "name": "逾期 91-120 天",
        "desc": ""
      },
      {
        "code": "5",
        "name": "逾期 121-150 天",
        "desc": ""
      },
      {
        "code": "6",
        "name": "逾期 151-180 天",
        "desc": ""
      },
      {
        "code": "7",
        "name": "逾期 180 天以上",
        "desc": ""
      },
      {
        "code": "B",
        "name": "呆账",
        "desc": "长期不还款，具体逾期天数未知。"
      },
      {
        "code": "C",
        "name": "正常销户",
        "desc": ""
      },
      {
        "code": "G",
        "name": "结束",
        "desc": "除正常销户外，其他形式的债权关系解除，如资产剥离。"
      },
      {
        "code": "#",
        "name": "未知",
        "desc": ""
      }
    ]
  },
  {
    "no": "50",
    "name": "个人借贷账户还款状态代码表（R3 账户）",
    "entries": [
      {
        "code": "*",
        "name": "本月没有透支行为且上月该账户没有透支余额",
        "desc": ""
      },
      {
        "code": "N",
        "name": "正常",
        "desc": "准贷记卡透支后还清"
      },
      {
        "code": "1",
        "name": "透支 1-30 天",
        "desc": ""
      },
      {
        "code": "2",
        "name": "透支 31-60 天",
        "desc": ""
      },
      {
        "code": "3",
        "name": "透支 61-90 天",
        "desc": ""
      },
      {
        "code": "4",
        "name": "透支 91-120 天",
        "desc": ""
      },
      {
        "code": "5",
        "name": "透支 121-150 天",
        "desc": ""
      },
      {
        "code": "6",
        "name": "透支 151-180 天",
        "desc": ""
      },
      {
        "code": "7",
        "name": "透支 180 天以上",
        "desc": ""
      },
      {
        "code": "B",
        "name": "呆账",
        "desc": "长期不还款，具体逾期天数未知。"
      },
      {
        "code": "C",
        "name": "正常销户",
        "desc": ""
      },
      {
        "code": "G",
        "name": "结束",
        "desc": "除正常销户外，其他形式的债权关系解除，如资产剥离。"
      },
      {
        "code": "#",
        "name": "未知",
        "desc": ""
      }
    ]
  },
  {
    "no": "51",
    "name": "公用事业业务类型代码表",
    "entries": [
      {
        "code": "00",
        "name": "电信缴费",
        "desc": ""
      },
      {
        "code": "01",
        "name": "电费信息",
        "desc": ""
      },
      {
        "code": "02",
        "name": "水费信息",
        "desc": ""
      },
      {
        "code": "03",
        "name": "燃气费信息",
        "desc": ""
      },
      {
        "code": "04",
        "name": "有线电视收视费",
        "desc": ""
      },
      {
        "code": "99",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "52",
    "name": "电信缴费状态代码表",
    "entries": [
      {
        "code": "1",
        "name": "正常缴费",
        "desc": ""
      },
      {
        "code": "2",
        "name": "欠费",
        "desc": ""
      }
    ]
  },
  {
    "no": "53",
    "name": "公用事业缴费状态代码表",
    "entries": [
      {
        "code": "1",
        "name": "正常缴费",
        "desc": ""
      },
      {
        "code": "2",
        "name": "欠缴费用",
        "desc": ""
      },
      {
        "code": "3",
        "name": "预缴费用",
        "desc": ""
      },
      {
        "code": "4",
        "name": "补缴费用",
        "desc": ""
      }
    ]
  },
  {
    "no": "54",
    "name": "评级代码表",
    "entries": [
      {
        "code": "A0",
        "name": "A",
        "desc": ""
      },
      {
        "code": "A1",
        "name": "A",
        "desc": ""
      },
      {
        "code": "A2",
        "name": "A+",
        "desc": ""
      },
      {
        "code": "A3",
        "name": "AA",
        "desc": ""
      },
      {
        "code": "A4",
        "name": "AA",
        "desc": ""
      },
      {
        "code": "A5",
        "name": "AA+",
        "desc": ""
      },
      {
        "code": "A6",
        "name": "AAA",
        "desc": ""
      },
      {
        "code": "A7",
        "name": "AAA",
        "desc": ""
      },
      {
        "code": "B0",
        "name": "B",
        "desc": ""
      },
      {
        "code": "B1",
        "name": "B",
        "desc": ""
      },
      {
        "code": "B2",
        "name": "B+",
        "desc": ""
      },
      {
        "code": "B3",
        "name": "BB",
        "desc": ""
      },
      {
        "code": "B4",
        "name": "BB",
        "desc": ""
      },
      {
        "code": "B5",
        "name": "BB+",
        "desc": ""
      },
      {
        "code": "B6",
        "name": "BBB",
        "desc": ""
      },
      {
        "code": "B7",
        "name": "BBB",
        "desc": ""
      },
      {
        "code": "B8",
        "name": "BBB+",
        "desc": ""
      },
      {
        "code": "C0",
        "name": "C",
        "desc": ""
      },
      {
        "code": "C1",
        "name": "C+",
        "desc": ""
      },
      {
        "code": "C2",
        "name": "CC",
        "desc": ""
      },
      {
        "code": "C3",
        "name": "CC",
        "desc": ""
      },
      {
        "code": "C4",
        "name": "CC+",
        "desc": ""
      },
      {
        "code": "C5",
        "name": "CCC",
        "desc": ""
      },
      {
        "code": "C6",
        "name": "CCC",
        "desc": ""
      },
      {
        "code": "C7",
        "name": "CCC+",
        "desc": ""
      }
    ]
  },
  {
    "no": "55",
    "name": "诉讼地位代码表",
    "entries": [
      {
        "code": "1",
        "name": "原告",
        "desc": ""
      },
      {
        "code": "2",
        "name": "被告",
        "desc": ""
      },
      {
        "code": "3",
        "name": "第三人",
        "desc": ""
      },
      {
        "code": "4",
        "name": "上诉人",
        "desc": ""
      },
      {
        "code": "5",
        "name": "被上诉人",
        "desc": ""
      }
    ]
  },
  {
    "no": "56",
    "name": "审判程序代码表",
    "entries": [
      {
        "code": "1",
        "name": "第一审",
        "desc": ""
      },
      {
        "code": "2",
        "name": "第二审",
        "desc": ""
      },
      {
        "code": "3",
        "name": "再审",
        "desc": ""
      },
      {
        "code": "4",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "57",
    "name": "结案方式代码表（民事判决记录）",
    "entries": [
      {
        "code": "1",
        "name": "判决",
        "desc": ""
      },
      {
        "code": "2",
        "name": "调解",
        "desc": ""
      },
      {
        "code": "3",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "58",
    "name": "结案方式代码表（强制执行记录）",
    "entries": [
      {
        "code": "1",
        "name": "不予执行",
        "desc": ""
      },
      {
        "code": "2",
        "name": "自动履行",
        "desc": ""
      },
      {
        "code": "3",
        "name": "和解履行完毕",
        "desc": ""
      },
      {
        "code": "4",
        "name": "执行完毕",
        "desc": ""
      },
      {
        "code": "5",
        "name": "终结执行",
        "desc": ""
      },
      {
        "code": "6",
        "name": "提级执行",
        "desc": ""
      },
      {
        "code": "7",
        "name": "指定执行",
        "desc": ""
      },
      {
        "code": "255",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "59",
    "name": "住房公积金缴费状态代码表",
    "entries": [
      {
        "code": "0",
        "name": "正常缴费",
        "desc": ""
      },
      {
        "code": "1",
        "name": "暂停缴费（中断）",
        "desc": ""
      },
      {
        "code": "2",
        "name": "终止缴费",
        "desc": ""
      }
    ]
  },
  {
    "no": "60",
    "name": "进出口商品校验分类监管级别代码表",
    "entries": [
      {
        "code": "1",
        "name": "一类企业",
        "desc": ""
      },
      {
        "code": "2",
        "name": "二类企业",
        "desc": ""
      }
    ]
  },
  {
    "no": "61",
    "name": "融资规模控制所属目录代码表",
    "entries": [
      {
        "code": "1",
        "name": "土地储备机构名录",
        "desc": ""
      }
    ]
  },
  {
    "no": "62",
    "name": "融资规模控制类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "年度可融资规模",
        "desc": ""
      }
    ]
  },
  {
    "no": "63",
    "name": "财务报表类型代码表",
    "entries": [
      {
        "code": "10",
        "name": "年报",
        "desc": ""
      },
      {
        "code": "20",
        "name": "半年报（上）",
        "desc": ""
      },
      {
        "code": "30",
        "name": "半年报（下）",
        "desc": ""
      },
      {
        "code": "40",
        "name": "季报（一）",
        "desc": ""
      },
      {
        "code": "50",
        "name": "季报（二）",
        "desc": ""
      },
      {
        "code": "60",
        "name": "季报（三）",
        "desc": ""
      },
      {
        "code": "70",
        "name": "季报（四）",
        "desc": ""
      }
    ]
  },
  {
    "no": "64",
    "name": "财务报表类型细分代码表",
    "entries": [
      {
        "code": "1",
        "name": "本部报表",
        "desc": ""
      },
      {
        "code": "2",
        "name": "合并报表",
        "desc": ""
      }
    ]
  },
  {
    "no": "65",
    "name": "声明及异议标注对象类型代码表",
    "entries": [
      {
        "code": "A00",
        "name": "报告",
        "desc": ""
      },
      {
        "code": "C01",
        "name": "基本概况信息单元",
        "desc": ""
      },
      {
        "code": "C02",
        "name": "注册资本及主要出资人信息单元",
        "desc": ""
      },
      {
        "code": "C03",
        "name": "主要组成人员信息单元",
        "desc": ""
      },
      {
        "code": "C04",
        "name": "上级机构信息单元",
        "desc": ""
      },
      {
        "code": "C05",
        "name": "实际控制人信息单元",
        "desc": ""
      },
      {
        "code": "D01",
        "name": "借贷账户信息单元",
        "desc": ""
      },
      {
        "code": "D03",
        "name": "欠息信息单元",
        "desc": ""
      },
      {
        "code": "D04",
        "name": "担保账户信息单元",
        "desc": ""
      },
      {
        "code": "D06",
        "name": "授信协议信息单元",
        "desc": ""
      },
      {
        "code": "D07",
        "name": "相关还款责任借贷账户（不含贴现）信息单元",
        "desc": ""
      },
      {
        "code": "D08",
        "name": "相关还款责任贴现账户信息单元",
        "desc": ""
      },
      {
        "code": "D09",
        "name": "相关还款责任担保账户信息单元",
        "desc": ""
      },
      {
        "code": "E01",
        "name": "公用事业缴费信息",
        "desc": ""
      },
      {
        "code": "F01",
        "name": "欠税记录信息单元",
        "desc": ""
      },
      {
        "code": "F02",
        "name": "民事判决信息单元",
        "desc": ""
      },
      {
        "code": "F03",
        "name": "强制执行信息单元",
        "desc": ""
      },
      {
        "code": "F04",
        "name": "行政处罚信息单元",
        "desc": ""
      },
      {
        "code": "F05",
        "name": "住房公积金参缴记录信息单元",
        "desc": ""
      },
      {
        "code": "F06",
        "name": "获得许可记录信息单元",
        "desc": ""
      },
      {
        "code": "F07",
        "name": "获得认证记录信息单元",
        "desc": ""
      },
      {
        "code": "F08",
        "name": "获得资质记录信息单元",
        "desc": ""
      },
      {
        "code": "F09",
        "name": "获得奖励记录信息单元",
        "desc": ""
      },
      {
        "code": "F10",
        "name": "出入境检验检疫绿色通道信息单元",
        "desc": ""
      },
      {
        "code": "F11",
        "name": "进出口商品免验信息单元",
        "desc": ""
      },
      {
        "code": "F12",
        "name": "进出口商品检验分类监管信息单元",
        "desc": ""
      },
      {
        "code": "F13",
        "name": "拥有专利情况信息单元",
        "desc": ""
      },
      {
        "code": "F14",
        "name": "融资规模控制信息单元",
        "desc": ""
      },
      {
        "code": "H01",
        "name": "评级信息单元",
        "desc": ""
      }
    ]
  },
  {
    "no": "66",
    "name": "标注及声明类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "数据提供机构说明",
        "desc": ""
      },
      {
        "code": "2",
        "name": "征信中心说明",
        "desc": ""
      },
      {
        "code": "3",
        "name": "信息主体声明",
        "desc": ""
      },
      {
        "code": "4",
        "name": "异议标注",
        "desc": ""
      }
    ]
  },
  {
    "no": "67",
    "name": "组织机构类型代码表",
    "entries": [
      {
        "code": "1",
        "name": "企业",
        "desc": ""
      },
      {
        "code": "11",
        "name": "公司",
        "desc": ""
      },
      {
        "code": "13",
        "name": "非公司制企业法人",
        "desc": ""
      },
      {
        "code": "15",
        "name": "企业分支机构",
        "desc": ""
      },
      {
        "code": "17",
        "name": "个人独资企业、合伙企业",
        "desc": ""
      },
      {
        "code": "19",
        "name": "其他企业",
        "desc": ""
      },
      {
        "code": "3",
        "name": "机关",
        "desc": ""
      },
      {
        "code": "31",
        "name": "中国共产党",
        "desc": ""
      },
      {
        "code": "32",
        "name": "国家权力机关法人",
        "desc": ""
      },
      {
        "code": "33",
        "name": "国家行政机关法人",
        "desc": ""
      },
      {
        "code": "34",
        "name": "国家司法机关法人",
        "desc": ""
      },
      {
        "code": "35",
        "name": "政协组织",
        "desc": ""
      },
      {
        "code": "36",
        "name": "民主党派",
        "desc": ""
      },
      {
        "code": "37",
        "name": "人民解放军、武警部队",
        "desc": ""
      },
      {
        "code": "39",
        "name": "其他机关",
        "desc": ""
      },
      {
        "code": "5",
        "name": "事业单位",
        "desc": ""
      },
      {
        "code": "51",
        "name": "事业单位法人",
        "desc": ""
      },
      {
        "code": "53",
        "name": "事业单位分支、派出机构",
        "desc": ""
      },
      {
        "code": "59",
        "name": "其他事业单位",
        "desc": ""
      },
      {
        "code": "7",
        "name": "社会团体",
        "desc": ""
      },
      {
        "code": "71",
        "name": "社会团体法人",
        "desc": ""
      },
      {
        "code": "73",
        "name": "社会团体分支、代表机构",
        "desc": ""
      },
      {
        "code": "79",
        "name": "其他社会团体",
        "desc": ""
      },
      {
        "code": "9",
        "name": "其他组织机构",
        "desc": ""
      },
      {
        "code": "91",
        "name": "民办非企业单位",
        "desc": ""
      },
      {
        "code": "93",
        "name": "基金会",
        "desc": ""
      },
      {
        "code": "94",
        "name": "宗教活动场所",
        "desc": ""
      },
      {
        "code": "95",
        "name": "农村村民委员会",
        "desc": ""
      },
      {
        "code": "96",
        "name": "城市居民委员会",
        "desc": ""
      },
      {
        "code": "97",
        "name": "自定义区",
        "desc": ""
      },
      {
        "code": "99",
        "name": "其他未列明的组织机构",
        "desc": ""
      },
      {
        "code": "A",
        "name": "个体工商户",
        "desc": "征信系统补充"
      }
    ]
  },
  {
    "no": "68",
    "name": "经济类型代码表",
    "entries": [
      {
        "code": "100",
        "name": "内资",
        "desc": ""
      },
      {
        "code": "110",
        "name": "国有全资",
        "desc": ""
      },
      {
        "code": "120",
        "name": "集体全资",
        "desc": ""
      },
      {
        "code": "130",
        "name": "股份合作",
        "desc": ""
      },
      {
        "code": "140",
        "name": "联营",
        "desc": ""
      },
      {
        "code": "141",
        "name": "国有联营",
        "desc": ""
      },
      {
        "code": "142",
        "name": "集体联营",
        "desc": ""
      },
      {
        "code": "143",
        "name": "国有与集体联营",
        "desc": ""
      },
      {
        "code": "149",
        "name": "其他联营",
        "desc": ""
      },
      {
        "code": "150",
        "name": "有限责任(公司)",
        "desc": ""
      },
      {
        "code": "159",
        "name": "其他有限责任(公司)",
        "desc": ""
      },
      {
        "code": "160",
        "name": "股份有限(公司)",
        "desc": ""
      },
      {
        "code": "170",
        "name": "私有",
        "desc": ""
      },
      {
        "code": "171",
        "name": "私有独资",
        "desc": ""
      },
      {
        "code": "172",
        "name": "私有合伙",
        "desc": ""
      },
      {
        "code": "173",
        "name": "私营有限责任(公司)",
        "desc": ""
      },
      {
        "code": "174",
        "name": "私营股份有限(公司)",
        "desc": ""
      },
      {
        "code": "175",
        "name": "个体经营",
        "desc": ""
      },
      {
        "code": "179",
        "name": "其他私有",
        "desc": ""
      },
      {
        "code": "190",
        "name": "其他内资",
        "desc": ""
      },
      {
        "code": "200",
        "name": "港、澳、台投资",
        "desc": ""
      },
      {
        "code": "210",
        "name": "内地和港、澳或台合资",
        "desc": ""
      },
      {
        "code": "220",
        "name": "内地和港、澳或台合作",
        "desc": ""
      },
      {
        "code": "230",
        "name": "港、澳或台独资",
        "desc": ""
      },
      {
        "code": "240",
        "name": "港、澳或台投资股份有限(公司)",
        "desc": ""
      },
      {
        "code": "290",
        "name": "其他港澳台投资",
        "desc": ""
      },
      {
        "code": "300",
        "name": "国外投资",
        "desc": ""
      },
      {
        "code": "310",
        "name": "中外合资",
        "desc": ""
      },
      {
        "code": "320",
        "name": "中外合作",
        "desc": ""
      },
      {
        "code": "330",
        "name": "外资",
        "desc": ""
      },
      {
        "code": "340",
        "name": "国外投资股份有限(公司)",
        "desc": ""
      },
      {
        "code": "390",
        "name": "其他国外投资",
        "desc": ""
      },
      {
        "code": "900",
        "name": "其他",
        "desc": ""
      }
    ]
  },
  {
    "no": "69",
    "name": "行业分类代码表",
    "entries": [
      {
        "code": "参照国标《国民经济行业分类》 （GB/T 4754-2017） ， 细化到小类。 目前正在使用的 最新版本可登陆征信系统网站查询、下载。",
        "name": "",
        "desc": ""
      }
    ]
  },
  {
    "no": "70",
    "name": "币种代码表",
    "entries": [
      {
        "code": "ADP",
        "name": "安道尔比塞塔",
        "desc": "参照国标《货币和资金的代码》（GB/T 12406-2008）。"
      },
      {
        "code": "AED",
        "name": "UAE 迪拉姆",
        "desc": ""
      },
      {
        "code": "AFA",
        "name": "阿富汗尼",
        "desc": ""
      },
      {
        "code": "ALL",
        "name": "列克",
        "desc": ""
      },
      {
        "code": "AMD",
        "name": "亚美尼亚达姆",
        "desc": ""
      },
      {
        "code": "……",
        "name": "……",
        "desc": ""
      },
      {
        "code": "ZWL",
        "name": "津巴布韦元",
        "desc": ""
      }
    ]
  },
  {
    "no": "71",
    "name": "担保交易相关还款责任类型码表",
    "entries": [
      {
        "code": "1",
        "name": "个人担保交易的共同债务人",
        "desc": ""
      },
      {
        "code": "2",
        "name": "反担保人",
        "desc": ""
      },
      {
        "code": "9",
        "name": "其他",
        "desc": ""
      },
      {
        "code": "0",
        "name": "合计（如上情况的汇总）",
        "desc": ""
      }
    ]
  },
  {
    "no": "71",
    "name": "公用事业业务类型",
    "entries": [
      {
        "code": "00",
        "name": "电信缴费",
        "desc": ""
      },
      {
        "code": "01",
        "name": "电费信息",
        "desc": ""
      },
      {
        "code": "02",
        "name": "水费信息",
        "desc": ""
      },
      {
        "code": "03",
        "name": "燃气费信息",
        "desc": ""
      },
      {
        "code": "04",
        "name": "有线电视收视费",
        "desc": ""
      },
      {
        "code": "99",
        "name": "其它",
        "desc": ""
      }
    ]
  }
]

export const CREDIT_MODEL = "企业征信报告（二代·V5.0）报文由数据块、信息单元、信息段、数据项四级结构组成；数据项出现次数 [1..1] 为必含、[0..1] 为选填、[0..*]/[0..99] 为可重复；Enum 类型数据项经「代码表」解译为中文含义。本数据由《企业征信报告结构说明（二代·V5.0）》Excel 规范全量抽取。"
// blocks=22 units=47 segments=43 items=993 domains=8 codeTables=72
