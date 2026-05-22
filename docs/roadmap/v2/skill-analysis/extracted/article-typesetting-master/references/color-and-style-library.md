# 配色方案库 + 强调样式系统

> 一篇文章的"衣服" | 颜色决定气质 | 样式决定节奏

---

## 配色方案库

### 方案1：科技蓝（专业/理性/干货）

```json
{
  "id": "tech-blue",
  "name": "科技蓝",
  "mood": "专业、理性、值得信赖",
  "适用": "科技文、干货教程、行业分析、商业报告",
  "colors": {
    "primary": "#1a6baf",
    "primary_light": "#e8f4fd",
    "secondary": "#2c3e50",
    "accent": "#e74c3c",
    "text_main": "#333333",
    "text_secondary": "#666666",
    "background": "#ffffff",
    "quote_bg": "#f0f7ff",
    "quote_border": "#1a6baf",
    "divider": "#e0e0e0"
  },
  "html_styles": {
    "h2": "color:#1a6baf; font-size:20px; font-weight:bold; border-left:4px solid #1a6baf; padding-left:12px; margin:30px 0 15px;",
    "h3": "color:#2c3e50; font-size:17px; font-weight:bold; margin:25px 0 10px;",
    "bold_accent": "color:#1a6baf; font-weight:bold;",
    "quote_block": "background:#f0f7ff; border-left:4px solid #1a6baf; padding:15px 20px; margin:20px 0; color:#333; font-size:15px; line-height:1.8;",
    "highlight_box": "background:#fff3cd; padding:12px 16px; border-radius:6px; margin:15px 0; font-size:14px;",
    "divider": "border:none; border-top:1px solid #e0e0e0; margin:30px 0;"
  }
}
```

### 方案2：暖橙（温暖/亲切/生活方式）

```json
{
  "id": "warm-orange",
  "name": "暖橙",
  "mood": "温暖、亲切、有人情味",
  "适用": "生活方式、美食、育儿、情感、个人成长",
  "colors": {
    "primary": "#e67e22",
    "primary_light": "#fef5e7",
    "secondary": "#8b6914",
    "accent": "#e74c3c",
    "text_main": "#333333",
    "text_secondary": "#666666",
    "background": "#fffbf5",
    "quote_bg": "#fef9f0",
    "quote_border": "#e67e22",
    "divider": "#f0e0c8"
  },
  "html_styles": {
    "h2": "color:#e67e22; font-size:20px; font-weight:bold; border-left:4px solid #e67e22; padding-left:12px; margin:30px 0 15px;",
    "h3": "color:#8b6914; font-size:17px; font-weight:bold; margin:25px 0 10px;",
    "bold_accent": "color:#e67e22; font-weight:bold;",
    "quote_block": "background:#fef9f0; border-left:4px solid #e67e22; padding:15px 20px; margin:20px 0; color:#333; font-size:15px; line-height:1.8;",
    "divider": "border:none; border-top:1px dashed #f0e0c8; margin:30px 0;"
  }
}
```

### 方案3：极简黑（高端/极简/文艺）

```json
{
  "id": "minimal-black",
  "name": "极简黑",
  "mood": "高端、克制、有品位",
  "适用": "设计、文学、艺术、品牌、高端商业",
  "colors": {
    "primary": "#1a1a1a",
    "primary_light": "#f5f5f5",
    "secondary": "#666666",
    "accent": "#c0a46b",
    "text_main": "#1a1a1a",
    "text_secondary": "#888888",
    "background": "#ffffff",
    "quote_bg": "#f8f8f8",
    "quote_border": "#1a1a1a",
    "divider": "#e8e8e8"
  },
  "html_styles": {
    "h2": "color:#1a1a1a; font-size:20px; font-weight:bold; letter-spacing:2px; margin:35px 0 15px; padding-bottom:8px; border-bottom:2px solid #1a1a1a;",
    "h3": "color:#1a1a1a; font-size:17px; font-weight:bold; letter-spacing:1px; margin:25px 0 10px;",
    "bold_accent": "color:#1a1a1a; font-weight:bold;",
    "quote_block": "background:#f8f8f8; border-left:3px solid #1a1a1a; padding:15px 20px; margin:25px 0; color:#333; font-size:15px; line-height:2; letter-spacing:0.5px;",
    "divider": "border:none; height:1px; background:linear-gradient(to right, transparent, #ccc, transparent); margin:35px 0;"
  }
}
```

### 方案4：清新绿（自然/健康/环保）

```json
{
  "id": "fresh-green",
  "name": "清新绿",
  "mood": "自然、清新、健康、可持续",
  "适用": "健康养生、环保、有机、户外、教育",
  "colors": {
    "primary": "#27ae60",
    "primary_light": "#eafaf1",
    "secondary": "#2c3e50",
    "accent": "#f39c12",
    "text_main": "#333333",
    "text_secondary": "#666666",
    "background": "#ffffff",
    "quote_bg": "#f0faf4",
    "quote_border": "#27ae60",
    "divider": "#d5f0e0"
  },
  "html_styles": {
    "h2": "color:#27ae60; font-size:20px; font-weight:bold; border-left:4px solid #27ae60; padding-left:12px; margin:30px 0 15px;",
    "h3": "color:#2c3e50; font-size:17px; font-weight:bold; margin:25px 0 10px;",
    "bold_accent": "color:#27ae60; font-weight:bold;",
    "quote_block": "background:#f0faf4; border-left:4px solid #27ae60; padding:15px 20px; margin:20px 0; color:#333; font-size:15px; line-height:1.8;"
  }
}
```

### 方案5：活力紫（创意/年轻/潮流）

```json
{
  "id": "vibrant-purple",
  "name": "活力紫",
  "mood": "创意、年轻、前卫、个性",
  "适用": "潮流、创意、年轻人社群、娱乐、AI/科技创新",
  "colors": {
    "primary": "#8e44ad",
    "primary_light": "#f5eef8",
    "secondary": "#2c3e50",
    "accent": "#e74c3c",
    "text_main": "#333333",
    "text_secondary": "#666666",
    "background": "#ffffff",
    "quote_bg": "#f8f0fc",
    "quote_border": "#8e44ad",
    "divider": "#e8d5f0"
  },
  "html_styles": {
    "h2": "color:#8e44ad; font-size:20px; font-weight:bold; border-left:4px solid #8e44ad; padding-left:12px; margin:30px 0 15px;",
    "h3": "color:#2c3e50; font-size:17px; font-weight:bold; margin:25px 0 10px;",
    "bold_accent": "color:#8e44ad; font-weight:bold;",
    "quote_block": "background:#f8f0fc; border-left:4px solid #8e44ad; padding:15px 20px; margin:20px 0; color:#333; font-size:15px; line-height:1.8;"
  }
}
```

### 方案6：中国红（传统/文化/节日）

```json
{
  "id": "china-red",
  "name": "中国红",
  "mood": "传统、庄重、节庆、文化自信",
  "适用": "传统文化、节日、国潮、政务、文旅",
  "colors": {
    "primary": "#c0392b",
    "primary_light": "#fef0ef",
    "secondary": "#8b4513",
    "accent": "#d4a017",
    "text_main": "#333333",
    "text_secondary": "#666666",
    "background": "#fffaf8",
    "quote_bg": "#fef5f3",
    "quote_border": "#c0392b",
    "divider": "#f0d0c8"
  },
  "html_styles": {
    "h2": "color:#c0392b; font-size:20px; font-weight:bold; border-left:4px solid #c0392b; padding-left:12px; margin:30px 0 15px;",
    "h3": "color:#8b4513; font-size:17px; font-weight:bold; margin:25px 0 10px;",
    "bold_accent": "color:#c0392b; font-weight:bold;",
    "quote_block": "background:#fef5f3; border-left:4px solid #c0392b; padding:15px 20px; margin:20px 0; color:#333; font-size:15px; line-height:1.8;"
  }
}
```

---

## 配色选择决策树

```
文章调性是什么？
│
├─ 专业/理性/干货 → 科技蓝 (tech-blue)
├─ 温暖/亲切/生活 → 暖橙 (warm-orange)
├─ 高端/极简/文艺 → 极简黑 (minimal-black)
├─ 自然/健康/环保 → 清新绿 (fresh-green)
├─ 创意/年轻/潮流 → 活力紫 (vibrant-purple)
├─ 传统/文化/节日 → 中国红 (china-red)
│
└─ 不确定？→ 默认使用科技蓝（最安全的选择）
```

---

## 强调样式系统

### HTML版强调元素模板

**金句引用框**：
```html
<section style="background:#f0f7ff; border-left:4px solid #1a6baf; padding:15px 20px; margin:20px 0; line-height:1.8; font-size:15px; color:#333;">
金句内容放这里
</section>
```

**重点高亮框**：
```html
<section style="background:#fff3cd; padding:12px 16px; border-radius:6px; margin:15px 0; font-size:14px; line-height:1.8; color:#856404;">
⚠️ 重点提示内容
</section>
```

**数据卡片框**：
```html
<section style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:20px; margin:20px 0; text-align:center;">
<span style="font-size:36px; font-weight:bold; color:#1a6baf;">86%</span>
<br/>
<span style="font-size:14px; color:#666;">的用户在手机上阅读文章</span>
</section>
```

**步骤序号样式**：
```html
<section style="display:flex; align-items:flex-start; margin:15px 0;">
<span style="background:#1a6baf; color:white; width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; margin-right:12px; flex-shrink:0;">1</span>
<span style="font-size:15px; line-height:1.8; color:#333;">步骤描述内容</span>
</section>
```

**分隔线样式**：
```html
<!-- 细线型 -->
<hr style="border:none; border-top:1px solid #e0e0e0; margin:30px 0;"/>

<!-- 渐变消失型 -->
<hr style="border:none; height:1px; background:linear-gradient(to right, transparent, #ccc, transparent); margin:35px 0;"/>

<!-- 符号型 -->
<p style="text-align:center; color:#ccc; margin:30px 0; letter-spacing:8px;">· · ·</p>

<!-- emoji型 -->
<p style="text-align:center; margin:25px 0; font-size:12px;">✦ ✦ ✦</p>
```

---

## 调性×配色×标题风格 速配表

```
调性          │ 配色方案    │ 标题前缀风格    │ 分隔线风格
──────────────┼────────────┼────────────────┼──────────
专业干货      │ 科技蓝     │ 数字序号型(A)   │ 细线型
温暖生活      │ 暖橙       │ Emoji标记型(B)  │ 符号型
高端文艺      │ 极简黑     │ 纯净型(D)       │ 渐变消失型
健康自然      │ 清新绿     │ Emoji标记型(B)  │ 符号型
年轻潮流      │ 活力紫     │ Emoji标记型(B)  │ emoji型
传统文化      │ 中国红     │ 括号标注型(E)   │ 符号型
```
