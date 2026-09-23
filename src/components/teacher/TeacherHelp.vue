<script setup lang="ts">
// 使用说明：功能介绍 + 导入表格模板说明 + 数据备份教程 + 常见问题。
// 纯静态内容，随版本维护；不读写数据。
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">使用说明</h3>
        <p class="tw-subtitle">功能概览、导入模板规范、备份恢复方法与常见问题。</p>
      </div>
    </div>

    <section class="tw-card">
      <h4 class="tw-card-title">功能介绍</h4>
      <ul class="hp-list">
        <li><strong>数据管理</strong>：维护班级信息、导入名单/成绩/家长表、备份与恢复数据、管理学期与班级。</li>
        <li><strong>学生名单</strong>：花名册（男蓝女粉、特异体质红色「!」）+ 可编辑明细表，修改自动保存。</li>
        <li><strong>座位表</strong>：设置行列 → 按名单或随机排座 → 拖动方块互换位置（手机端点两下互换）。</li>
        <li><strong>成绩分析</strong>：按考试看统计卡、分段柱状图与排名走势，成绩可直接编辑。</li>
        <li><strong>试卷分析</strong>：录入题目与错题人数，自动算错误率并排出易错知识点。</li>
        <li><strong>值日生表</strong>：周一至周五值日安排 + 班委名单与职责。</li>
        <li><strong>家长联系方式</strong>：搜索、导入、导出，手机端可直接拨号。</li>
        <li><strong>点名</strong>：滚动抽签，支持「只点一遍」排除已点学生。</li>
        <li><strong>课程表</strong>：点击格子编辑科目，节次时间可配置。</li>
        <li><strong>特异体质学生</strong>：过敏原 / 慢性疾病 / 注意事项 / 紧急电话档案。</li>
        <li><strong>奖励记录</strong>：按学生记录奖励与表扬的时间线，支持图片（自动压缩）。</li>
      </ul>
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">导入表格模板说明</h4>
      <p class="tw-card-hint">支持 .xlsx / .xls / .csv，列名带 * 也能识别；CSV 请用 UTF-8 编码另存，出现乱码会自动按 GBK 尝试。</p>
      <div class="tw-table-wrap">
        <table class="tw-table">
          <thead>
            <tr>
              <th>导入类型</th>
              <th>必需列</th>
              <th>可选列</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>学生名单</td>
              <td>姓名、性别</td>
              <td>学号</td>
              <td>导入后按学号自动重排座位表</td>
            </tr>
            <tr>
              <td>成绩</td>
              <td>姓名（第一列）</td>
              <td>—</td>
              <td>其余数值列各生成一场考试；重名学生不会静默匹配</td>
            </tr>
            <tr>
              <td>家长信息</td>
              <td>姓名、家长、电话</td>
              <td>关系</td>
              <td>按学生姓名精确匹配后更新</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">数据备份教程</h4>
      <ol class="hp-list">
        <li>点击右上角「设置 → 数据管理 → 备份与恢复」，再点「备份数据」下载 JSON 文件。</li>
        <li>换设备或重装后，打开同一页面点击「恢复数据」，选择该 JSON 文件即可整包恢复。</li>
        <li>想先体验可点「恢复示例数据」（虚构数据，会覆盖当前数据）。</li>
        <li>「清空所有数据」需二次确认，操作前建议先备份。</li>
      </ol>
      <p class="tw-note">数据默认保存在本机浏览器；本应用已接入工作台的云同步机制，登录并开启云同步后可跨设备使用。</p>
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">常见问题</h4>
      <dl class="hp-faq">
        <dt>为什么有些功能看不到？</dt>
        <dd>「本班身份」选为「非班主任 · 科任」时，座位表、值日生表、家长联系方式、特异体质学生会隐藏（家长电话与体质信息属敏感信息，遵循最小可见原则）。把身份改回班主任即可恢复。</dd>
        <dt>切换学期或班级会丢数据吗？</dt>
        <dd>不会。切换只改变当前指向的分组，记录仍保存在各自的「学期 × 班级」数据桶里。</dd>
        <dt>同名学生会影响成绩导入吗？</dt>
        <dd>不会静默错配。系统以学号等复合主键标识学生，遇到同名会在导入结果中提示，并不写入该行。</dd>
        <dt>打印 / 导出 Excel 怎么用？</dt>
        <dd>点击各页「打印」按钮，在浏览器打印对话框中选择「另存为 PDF」或直接打印（A4 纵向，已隐藏侧栏与按钮）；「导出 Excel」会把当前页面的表格数据下载为 .xlsx 文件。</dd>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.hp-list {
  margin: 0;
  padding-left: 20px;
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #64748b);
  line-height: var(--line-height-relaxed, 1.7);
}

.hp-faq {
  margin: 0;
  font-size: var(--font-size-sm, 13px);
}

.hp-faq dt {
  margin-top: 10px;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #0f172a);
}

.hp-faq dd {
  margin: 4px 0 0;
  color: var(--color-text-secondary, #64748b);
  line-height: var(--line-height-normal, 1.5);
}
</style>
