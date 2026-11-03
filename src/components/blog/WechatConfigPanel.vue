<script setup lang="ts">
/**
 * 博客设置 → 微信公众号凭证配置面板
 *
 * 从原「站点设置」迁入（2026-10）：凭证不再落服务端盘，改为浏览器本地 + 随 blog.json 云同步信封，
 * 由无状态代理按 AppID 调用。本面板复用 useWechatConfig（底层读写 blog store），
 * 视觉沿用 AppSettingsDialog 的 wb-menu-* 语言（样式随组件内置，避免依赖全局）。
 *
 * 仅在「博客设置 → 微信公众号」被激活时挂载，挂载即 loadConfig。
 */
import { onMounted } from 'vue'
import { useWechatConfig } from '@/composables/useWechatConfig'
import { copyText } from '@/utils/download'

const cfg = useWechatConfig()
onMounted(() => cfg.loadConfig())

/** 复制出口 IP：复用全局 copyText（非安全上下文会降级并提示，不会静默失败） */
function copyEgressIp(): void {
  void copyText(cfg.egressIp.value, '服务器出口 IP 已复制')
}
</script>

<template>
  <div class="wb-menu-config wechat-config">
    <div class="wb-menu-head">
      <h3 class="wb-menu-title">微信公众号</h3>
      <span v-if="cfg.configured.value" class="status-pill"><span class="status-dot"></span>已配置</span>
      <span
        v-else
        class="status-pill"
        style="color: var(--ds-text-3); background-color: var(--color-bg-input); border-color: var(--ds-line, #ececf0);"
      ><span class="status-dot" style="background-color: var(--ds-text-3, #9aa0a6);"></span>未配置</span>
    </div>
    <p class="wb-menu-hint">
      配置已认证的公众号 AppID / AppSecret，用于在文章编辑页一键发布到「微信公众号草稿箱」。
      凭证保存在本机浏览器，并随云同步在您的设备间同步；代理不落盘、仅按 AppID 缓存 token、互不串号。
    </p>

    <!-- 服务器出口 IP：公众号后台「IP 白名单」必须包含它，否则调用微信接口报 40164/61004。
         使用者不必知道服务器地址，这里由代理代查并支持一键复制。 -->
    <div class="egress-box" data-testid="wechat-egress">
      <div class="egress-row">
        <span class="remind-label">服务器出口 IP</span>
        <code class="egress-ip" data-testid="wechat-egress-ip">{{ cfg.egressChecking.value ? '检测中…' : (cfg.egressIp.value || '未获取') }}</code>
        <button
          type="button"
          class="wb-menu-btn egress-btn"
          :disabled="!cfg.egressIp.value"
          data-testid="wechat-egress-copy"
          @click="copyEgressIp"
        >复制</button>
        <button
          type="button"
          class="wb-menu-btn egress-btn"
          :disabled="cfg.egressChecking.value"
          data-testid="wechat-egress-refresh"
          @click="cfg.probeEgressIp(true)"
        >{{ cfg.egressChecking.value ? '检测中' : '重新检测' }}</button>
      </div>
      <p class="wb-menu-hint egress-hint">
        把这个 IP 加入公众号后台「设置与开发 → 基本配置 → IP 白名单」，保存后约 1 分钟生效；不添加会报 40164 / 61004。
        <a class="egress-link" href="https://mp.weixin.qq.com/" target="_blank" rel="noopener noreferrer">打开公众号后台</a>
        <span v-if="cfg.egressError.value" class="egress-err">（{{ cfg.egressError.value }}）</span>
      </p>
    </div>

    <div v-if="cfg.configured.value" class="remind-field" style="margin-top: 8px;">
      <span class="remind-label">当前 AppID</span>
      <span class="wb-menu-name-input" style="display: inline-flex; align-items: center; color: var(--ds-text-2);">{{ cfg.appIdMasked.value || '—' }}</span>
    </div>

    <div class="remind-fields" style="margin-top: 12px;">
      <label class="remind-field">
        <span class="remind-label">AppID</span>
        <input
          type="text"
          class="wb-menu-name-input"
          placeholder="wx 开头的 16-32 位字母数字"
          data-testid="wechat-appid"
          :value="cfg.appId.value"
          @input="cfg.appId.value = ($event.target as HTMLInputElement).value"
        />
      </label>
      <label class="remind-field">
        <span class="remind-label">AppSecret</span>
        <el-input
          type="password"
          show-password
          placeholder="留空则不修改已保存的密钥"
          data-testid="wechat-appsecret"
          autocomplete="new-password"
          :model-value="cfg.appSecret.value"
          @update:model-value="cfg.appSecret.value = $event"
        />
      </label>
    </div>

    <p class="wb-menu-hint" style="color: var(--ds-text-3); opacity: 0.7; font-size: var(--fs-caption, 12px); margin-top: 4px;">
      提示：保存后会尝试调用微信接口校验凭证有效性（需部署代理且可达）。若校验未通过，先确认 AppSecret 是否正确；
      若提示 IP 白名单，把上面的「服务器出口 IP」加到公众号后台即可。
    </p>

    <div class="remind-actions" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
      <button
        type="button"
        class="wb-menu-btn"
        data-testid="wechat-save"
        :disabled="cfg.saving.value"
        @click="cfg.saveConfig()"
      >
        <span v-if="cfg.saving.value" class="btn-spinner" aria-hidden="true"></span>
        {{ cfg.saving.value ? '保存中' : '保存凭证' }}
      </button>
      <span
        v-if="cfg.successMsg.value"
        class="status-pill"
        style="color: #16a34a; background-color: rgba(22,163,74,0.1); border-color: rgba(22,163,74,0.25);"
      ><span class="status-dot"></span>{{ cfg.successMsg.value }}</span>
    </div>

    <p
      v-if="cfg.error.value"
      class="wb-menu-hint"
      style="color: var(--color-danger, #dc2626); margin-top: 8px;"
      data-testid="wechat-error"
    >{{ cfg.error.value }}</p>
  </div>
</template>

<style scoped>
.wb-menu-config {
  margin-bottom: 20px;
  padding: 14px;
  background-color: var(--ds-card, #ffffff);
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-ctrl, 8px);
}

.wb-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wb-menu-title {
  margin: 0;
  font-size: var(--fs-body, 14px);
  font-weight: 600;
  color: var(--ds-text);
}

.wb-menu-hint {
  margin: 6px 0 12px;
  font-size: var(--fs-caption, 12px);
  color: var(--ds-text-3);
}

/* 行内文本输入：视觉统一到全局 .ui-input（别名已含 .wb-menu-name-input），这里只保留布局 */
.wb-menu-name-input {
  flex: 1;
  min-width: 0;
}

.remind-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.remind-field {
  display: flex;
  align-items: center;
  gap: 10px;
}
/* 密钥输入用 el-input（show-password），在行内需要撑满剩余宽度 */
.remind-field :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
.remind-label {
  flex-shrink: 0;
  width: 92px;
  font-size: var(--fs-sm, 13px);
  color: var(--ds-text);
}
.remind-actions {
  margin-top: 12px;
}

/* 出口 IP 行：等宽字体展示，窄屏自动换行、不挤压按钮 */
.egress-box {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-ctrl, 8px);
  background-color: var(--color-bg-subtle, #fafbfc);
}

.egress-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.egress-ip {
  min-width: 126px;
  padding: 4px 8px;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: var(--fs-sm, 13px);
  color: var(--ds-text);
  background-color: var(--ds-card, #ffffff);
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: 6px;
}

.egress-btn {
  padding: 0 10px;
}

.egress-hint {
  margin: 8px 0 0;
}

.egress-link {
  margin-left: 2px;
  color: var(--color-primary, #2563eb);
  text-decoration: none;
}

.egress-link:hover {
  text-decoration: underline;
}

.egress-err {
  color: var(--color-danger, #dc2626);
}

html.dark .egress-box {
  background-color: rgba(255, 255, 255, 0.03);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption, 12px);
  color: #16a34a;
  background-color: rgba(22, 163, 74, 0.1);
  border: 1px solid rgba(22, 163, 74, 0.25);
  padding: 4px 10px;
  border-radius: var(--ds-radius-pill, 999px);
  white-space: nowrap;
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; background-color: #16a34a; }
html.dark .status-pill { color: #4ade80; background-color: rgba(74, 222, 128, 0.12); border-color: rgba(74, 222, 128, 0.3); }
html.dark .remind-label { color: #f9fafb; }

.btn-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 6px;
  vertical-align: -1px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  opacity: 0.75;
  animation: btn-spin 0.7s linear infinite;
}
@keyframes btn-spin {
  to { transform: rotate(360deg); }
}
</style>
