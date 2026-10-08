import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

/**
 * ESLint flat config —— Vue 3 + TypeScript + Vite
 *
 * 取向：**代码正确性优先，不做格式警察**。
 * - 不引入 Prettier：全库重排会产生与治理无关的巨大 diff。格式沿用既有风格。
 * - 因此只用 `flat/essential`（vue 的正确性子集），**不启用** `strongly-recommended`/`recommended`
 *   ——它们包含 ~18000 条格式告警（html-indent / max-attributes-per-line 等），
 *   属 Prettier 职责，保留只会淹没真实问题。
 * - 存量问题（如 96 处 `any`）降级为 warning：不阻塞构建，但可 `npm run lint` 持续跟踪；
 *   真实缺陷（重复键、不可达分支、computed 副作用等）保持 error。
 *
 * 与既有约束的分工：
 * - 未使用变量/参数已由 tsconfig 的 `noUnusedLocals`/`noUnusedParameters` + `vue-tsc` 把关，
 *   故关闭 base 的 `no-unused-vars`/`no-undef`，避免同一问题双重报错。
 */
export default [
  {
    // 构建产物、依赖、静态资源与工具脚本不参与应用代码规范
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'scripts/**', '**/*.min.js', '**/*.cjs']
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  // 应用代码（src 下的 ts / vue）
  {
    files: ['src/**/*.{ts,vue}'],
    linterOptions: {
      // 存量代码里有若干 `// eslint-disable-next-line no-console` 等注释，
      // 在 no-console 关闭后它们会变成 "unused directive" 噪音，故不报告
      reportUnusedDisableDirectives: 'off'
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' }
    },
    rules: {
      // TS 侧已严格把关
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],

      // 存量 `any` 较多（96 处），先降级跟踪，随重构逐步收敛；
      // 新代码不应继续引入，可按需临时开 error
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',

      // 项目大量 console 输出错误/调试信息，不作为错误
      'no-console': 'off',
      // 中文文案中的全角/不规则空白属排版，不阻塞
      'no-irregular-whitespace': 'off',
      // computed 内副作用：toolbox 工具中存在"惰性计算并缓存"的刻意写法，
      // 可能引发响应式问题，但改动会变更行为，先告警待逐个确认
      'vue/no-side-effects-in-computed-properties': 'warn',

      // 以下为真实缺陷类别，保持 error
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-func-assign': 'error',
      'no-self-compare': 'error',
      'no-constant-condition': 'error',
      'no-constant-binary-expression': 'error',
      'valid-typeof': 'error',
      // 以下三条涉及既有正则/模板行为，自动改动可能改变功能，先告警待逐个确认：
      // no-useless-escape: json.ts 的 JSON 分词正则里 `\[` 属无害冗余转义
      // no-useless-backreference: RegexTestTool 面向用户解释正则，反向引用本身即展示内容
      'no-useless-escape': 'warn',
      'no-useless-backreference': 'warn',
      'no-useless-rename': 'error',
      'no-dupe-else-if': 'error',
      'prefer-const': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // vue 模板正确性
      'vue/no-dupe-keys': 'error',
      'vue/no-duplicate-attributes': 'error',
      'vue/valid-v-for': 'error',
      'vue/valid-v-if': 'error',
      'vue/valid-v-model': 'error',
      // AppSettingsDialog:2119 的 v-show + transition 组合需 UI 层确认，暂告警
      'vue/require-toggle-inside-transition': 'warn',
      'vue/no-useless-template-attributes': 'error',
      'vue/no-use-v-if-with-v-for': 'warn',
      // 项目存在 Icon.vue / Toast.vue 等单字组件名（通用基元），不强制 multi-word
      'vue/multi-word-component-names': 'off',
      'vue/require-v-for-key': 'warn',
      'vue/no-unused-components': 'warn',
      'vue/attribute-hyphenation': 'warn',
      'vue/component-name-in-template-casing': 'warn',
      'vue/no-v-html': 'off' // 项目有少量受控富文本渲染场景
    }
  },

  // 构建/工具链配置（Node 环境）
  {
    files: ['*.config.js', 'vite.config.js'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }
    }
  }
]
