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

const cfg = useWechatConfig()
onMounted(() => cfg.loadConfig())
</script>

<template>
  <div class="wb-menu-config wechat-config">
    <div class="wb-menu-head">
      <h3 class="wb-menu-title">微信公众号</h3>
      <span v-if="cfg.configured.value" class="status-pill"><span class="status-dot"></span>已配置</span>
      <span
        v-else
        class="status-pill"
        style="color: var(--color-text-muted); background-color: var(--color-bg-input); border-color: var(--color-border);"
      ><span class="status-dot" style="background-color: var(--color-text-muted);"></span>未配置</span>
    </div>
    <p class="wb-menu-hint">
      配置已认证的公众号 AppID / AppSecret，用于在文章编辑页一键发布到「微信公众号草稿箱」。
      凭证保存在本机浏览器，并随云同步在您的设备间同步；代理不落盘、仅按 AppID 缓存 token、互不串号。
    </p>

    <div v-if="cfg.configured.value" class="remind-field" style="margin-top: 8px;">
      <span class="remind-label">当前 AppID</span>
      <span class="wb-menu-name-input" style="display: inline-flex; align-items: center; color: var(--color-text-secondary);">{{ cfg.appIdMasked.value || '—' }}</span>
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
        <input
          type="password"
          class="wb-menu-name-input"
          placeholder="留空则不修改已保存的密钥"
          data-testid="wechat-appsecret"
          autocomplete="new-password"
          :value="cfg.appSecret.value"
          @input="cfg.appSecret.value = ($event.target as HTMLInputElement).value"
        />
      </label>
    </div>

    <p class="wb-menu-hint" style="color: var(--color-text-muted); opacity: 0.7; font-size: 12px; margin-top: 4px;">
      提示：保存后会尝试调用微信接口校验凭证有效性（需部署代理且可达）。若校验未通过，请确认 AppSecret 正确，并在公众号后台「基本配置 → IP 白名单」加入本服务器出口公网 IP（否则会报 40164 / 61004）。
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
  background-color: var(--color-bg-card, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
}

.wb-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wb-menu-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
}

.wb-menu-hint {
  margin: 6px 0 12px;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}

.wb-menu-name-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--color-text, #0f172a);
  background-color: var(--color-bg-input, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  transition: border-color 0.15s ease;
}
.wb-menu-name-input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
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
.remind-label {
  flex-shrink: 0;
  width: 92px;
  font-size: 13px;
  color: var(--color-text, #0f172a);
}
.remind-actions {
  margin-top: 12px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #16a34a;
  background-color: rgba(22, 163, 74, 0.1);
  border: 1px solid rgba(22, 163, 74, 0.25);
  padding: 4px 10px;
  border-radius: 999px;
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
