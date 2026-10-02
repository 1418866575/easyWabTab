<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { copyText, downloadBlob } from '../../core/download'

interface Field {
  key: string
  label: string
  placeholder?: string
  required?: boolean
  type?: 'text' | 'textarea' | 'date' | 'number'
  suffix?: string
}

interface Tpl {
  id: string
  name: string
  desc: string
  fields: Field[]
  build: (v: Record<string, string>) => string
}

function g(v: Record<string, string>, k: string, fb = '______'): string {
  const x = (v[k] || '').trim()
  return x || fb
}

const tpls: Tpl[] = [
  {
    id: 'loan',
    name: '个人借款合同',
    desc: '自然人之间的小额借款，含金额、利率、期限、还款方式等。',
    fields: [
      { key: 'lender', label: '甲方（出借人）姓名', required: true },
      { key: 'lenderId', label: '出借人身份证号' },
      { key: 'borrower', label: '乙方（借款人）姓名', required: true },
      { key: 'borrowerId', label: '借款人身份证号' },
      { key: 'amount', label: '借款金额', type: 'number', suffix: '元', required: true },
      { key: 'rate', label: '年利率', type: 'number', suffix: '%' },
      { key: 'term', label: '借款期限（如 12 个月）', required: true },
      { key: 'purpose', label: '借款用途' },
      { key: 'repayment', label: '还款方式（如 到期一次性还本付息）' },
      { key: 'date', label: '签署日期', type: 'date' }
    ],
    build: (v) => `个人借款合同

甲方（出借人）：${g(v, 'lender')}
身份证号码：${g(v, 'lenderId')}
乙方（借款人）：${g(v, 'borrower')}
身份证号码：${g(v, 'borrowerId')}

鉴于乙方有资金需求，甲方同意向乙方出借资金，双方本着平等、自愿、诚实信用的原则，就借款事宜达成如下协议：

第一条 借款金额
甲方向乙方出借人民币（小写）¥${g(v, 'amount')}。

第二条 借款用途
本借款用于：${g(v, 'purpose')}。乙方不得擅自改变借款用途。

第三条 借款期限
借款期限：${g(v, 'term')}，自款项实际交付之日起计算。

第四条 借款利率
年利率为 ${g(v, 'rate')}%，利息自款项交付之日起按实际占用天数计算。

第五条 还款方式
还款方式：${g(v, 'repayment')}。

第六条 违约责任
乙方逾期还款的，应按未还金额的日万分之五向甲方支付违约金，并承担甲方为实现债权支出的合理费用（含律师费、保全费、诉讼费）。

第七条 争议解决
因本合同发生的争议，双方应协商解决；协商不成的，提交甲方所在地有管辖权的人民法院诉讼解决。

第八条 其他约定
本合同一式两份，甲乙双方各执一份，自款项实际交付之日起生效。

甲方（签字）：____________      乙方（签字）：____________
签署日期：${g(v, 'date')}`
  },
  {
    id: 'rent',
    name: '房屋租赁合同',
    desc: '住宅/商铺租赁，含房屋信息、租金、押金、租期等。',
    fields: [
      { key: 'lessor', label: '甲方（出租方）', required: true },
      { key: 'lessorTel', label: '出租方联系电话' },
      { key: 'lessee', label: '乙方（承租方）', required: true },
      { key: 'lesseeTel', label: '承租方联系电话' },
      { key: 'address', label: '房屋地址', required: true },
      { key: 'area', label: '建筑面积', type: 'number', suffix: '㎡' },
      { key: 'rent', label: '月租金', type: 'number', suffix: '元', required: true },
      { key: 'deposit', label: '押金', type: 'number', suffix: '元' },
      { key: 'start', label: '起租日期', type: 'date', required: true },
      { key: 'end', label: '终止日期', type: 'date', required: true },
      { key: 'cycle', label: '支付周期（如 押一付三）' }
    ],
    build: (v) => `房屋租赁合同

出租方（甲方）：${g(v, 'lessor')}    联系电话：${g(v, 'lessorTel')}
承租方（乙方）：${g(v, 'lessee')}    联系电话：${g(v, 'lesseeTel')}

根据《中华人民共和国民法典》及相关法律法规，甲乙双方在平等、自愿、协商一致的基础上，就房屋租赁事宜达成如下协议：

第一条 房屋基本情况
房屋坐落：${g(v, 'address')}；建筑面积约 ${g(v, 'area')} 平方米。

第二条 租赁期限
租赁期限自 ${g(v, 'start')} 起至 ${g(v, 'end')} 止。

第三条 租金及押金
月租金为人民币 ¥${g(v, 'rent')}；押金为人民币 ¥${g(v, 'deposit')}。支付周期：${g(v, 'cycle')}。

第四条 双方权利义务
1. 甲方应保证房屋具备正常居住条件，并在租赁期内不得擅自收回房屋。
2. 乙方应按约定支付租金，合理使用房屋及附属设施，不得擅自转租、改造。
3. 租赁期间的水、电、燃气、物业等费用由乙方承担。

第五条 合同解除
任何一方需提前解除合同的，应提前 30 日书面通知对方；违约方应赔偿守约方因此遭受的损失。

第六条 争议解决
因本合同发生的争议，双方协商解决；协商不成的，向房屋所在地人民法院提起诉讼。

第七条 其他约定
本合同一式两份，甲乙双方各执一份，自双方签字之日起生效。

甲方（签字）：____________      乙方（签字）：____________
签署日期：${g(v, 'start')}`
  },
  {
    id: 'service',
    name: '劳务/兼职协议',
    desc: '临时性劳务、兼职、外包服务，含服务内容、费用与结算。',
    fields: [
      { key: 'partyA', label: '甲方（用工方）', required: true },
      { key: 'partyAtel', label: '用工方联系电话' },
      { key: 'partyB', label: '乙方（提供方）', required: true },
      { key: 'partyBtel', label: '提供方联系电话' },
      { key: 'content', label: '服务内容', type: 'textarea', required: true },
      { key: 'fee', label: '服务费用', type: 'number', suffix: '元', required: true },
      { key: 'start', label: '开始日期', type: 'date' },
      { key: 'end', label: '结束日期', type: 'date' },
      { key: 'settle', label: '结算方式（如 验收后 7 日内付清）' }
    ],
    build: (v) => `劳务/兼职服务协议

甲方（用工方）：${g(v, 'partyA')}    联系电话：${g(v, 'partyAtel')}
乙方（提供方）：${g(v, 'partyB')}    联系电话：${g(v, 'partyBtel')}

甲乙双方就劳务/服务合作事宜，经协商一致，达成如下协议：

第一条 服务内容
乙方应按甲方要求提供以下服务：${g(v, 'content')}

第二条 服务期限
自 ${g(v, 'start')} 起至 ${g(v, 'end')} 止。

第三条 服务费用
服务费用合计人民币 ¥${g(v, 'fee')}。

第四条 结算方式
${g(v, 'settle')}

第五条 双方责任
1. 甲方应及时提供必要的工作条件与资料，并按时支付费用。
2. 乙方应按时、保质完成服务内容，对其工作成果负责。

第六条 保密与知识产权
乙方在服务过程中知悉的甲方商业秘密应予保密；服务成果的知识产权归属由双方另行约定。

第七条 争议解决
因本协议发生的争议，双方协商解决；协商不成的，提交甲方所在地人民法院诉讼解决。

第八条 其他
本协议一式两份，甲乙双方各执一份，自双方签字之日起生效。

甲方（签字/盖章）：____________      乙方（签字）：____________`
  },
  {
    id: 'nda',
    name: '保密协议（NDA）',
    desc: '双向/单向保密约定，含保密信息范围、期限与责任。',
    fields: [
      { key: 'discloser', label: '披露方', required: true },
      { key: 'receiver', label: '接收方', required: true },
      { key: 'purpose', label: '保密目的与背景', type: 'textarea', required: true },
      { key: 'term', label: '保密期限（如 自签署之日起 3 年）', required: true },
      { key: 'date', label: '签署日期', type: 'date' }
    ],
    build: (v) => `保密协议（NDA）

披露方：${g(v, 'discloser')}
接收方：${g(v, 'receiver')}

鉴于双方在合作过程中可能相互披露保密信息，为保护信息安全，双方达成如下保密约定：

第一条 保密目的
本协议旨在保护双方在「${g(v, 'purpose')}」合作过程中所披露的保密信息。

第二条 保密信息范围
保密信息包括但不限于：技术资料、商业计划、客户名单、财务数据、源代码及其他以书面、口头或电子形式标明或应被合理认定为保密的信息。

第三条 保密义务
1. 接收方应对保密信息严格保密，不得向任何第三方披露。
2. 接收方仅可在本协议目的范围内使用保密信息。
3. 未经披露方书面同意，不得复制、传播或用于其他用途。

第四条 保密期限
本协议项下的保密义务自本协议签署之日起，持续 ${g(v, 'term')}。

第五条 违约责任
任一方违反本协议约定的，应赔偿守约方因此遭受的全部损失（含律师费、诉讼费）。

第六条 争议解决
因本协议发生的争议，双方协商解决；协商不成的，提交披露方所在地人民法院诉讼解决。

第七条 其他
本协议一式两份，双方各执一份，自双方签字之日起生效。

披露方（签字/盖章）：____________      接收方（签字/盖章）：____________
签署日期：${g(v, 'date')}`
  }
]

const disclaimer = '\n\n————————————————————————\n温馨提示：本文件由「合同模板生成器」自动生成，仅供草拟参考，不构成法律意见；正式签署前请结合实际情况完善条款并咨询专业律师。'

const activeId = ref(tpls[0].id)
const active = computed(() => tpls.find((t) => t.id === activeId.value)!)
const form = ref<Record<string, string>>({})

watch(activeId, () => { form.value = {} })

const missing = computed(() =>
  active.value.fields.filter((f) => f.required && !(form.value[f.key] || '').trim()).map((f) => f.label)
)

const contract = computed(() => active.value.build(form.value) + disclaimer)

function copyAll() { copyText(contract.value) }
function dl() {
  const name = '合同-' + active.value.name + '.txt'
  downloadBlob(name, new Blob(['﻿' + contract.value], { type: 'text/plain;charset=utf-8' }))
}
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择合同模板</label>
        <div class="tu-seg" style="display:flex;flex-direction:column;width:100%">
          <button
            v-for="t in tpls"
            :key="t.id"
            :class="{ 'is-on': t.id === activeId }"
            style="border-right:none;border-bottom:1px solid var(--color-border);text-align:left"
            @click="activeId = t.id"
          >{{ t.name }}</button>
        </div>
        <p class="tu-hint">{{ active.desc }}</p>
      </div>

      <div v-for="f in active.fields" :key="f.key" class="tu-field">
        <label class="tu-label">{{ f.label }}<span v-if="f.required" style="color:var(--color-error)"> *</span></label>
        <textarea
          v-if="f.type === 'textarea'"
          v-model="form[f.key]"
          class="tu-textarea"
          rows="3"
          :placeholder="f.placeholder"
        />
        <input
          v-else
          v-model="form[f.key]"
          class="tu-input"
          :type="f.type || 'text'"
          :placeholder="f.placeholder"
        />
      </div>
    </div>

    <div>
      <div class="tu-row">
        <button class="tu-btn" @click="copyAll">复制全文</button>
        <button class="tu-btn ghost" @click="dl">下载 TXT</button>
      </div>
      <p v-if="missing.length" class="tu-alert">以下必填项尚未填写：{{ missing.join('、') }}（留空处以 ______ 占位）</p>
      <p class="tu-hint">所有内容仅在本地生成，不上传任何信息。</p>
      <div class="tu-field" style="margin-top:6px">
        <label class="tu-label">合同预览</label>
        <pre class="tu-out" style="max-height:460px;white-space:pre-wrap;font-family:var(--font-family)">{{ contract }}</pre>
      </div>
    </div>
  </div>
</template>
