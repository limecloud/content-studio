# 公众号HTML排版模板

> 直接复制到秀米/135编辑器/公众号后台 | 全部内联样式 | 所见即所得

---

## 完整文章HTML骨架

```html
<!-- ========== 文章开始 ========== -->
<section style="padding:0 8px; color:#333; font-size:15px; line-height:2; letter-spacing:0.5px;">

<!-- 引言/导语 -->
<p style="font-size:14px; color:#888; margin-bottom:25px; padding-bottom:15px; border-bottom:1px solid #eee;">
导语内容，一两句话概括文章要点
</p>

<!-- H2章节标题 -->
<h2 style="color:#1a6baf; font-size:20px; font-weight:bold; border-left:4px solid #1a6baf; padding-left:12px; margin:35px 0 15px; line-height:1.4;">
章节标题
</h2>

<!-- 正文段落 -->
<p style="margin-bottom:20px;">
正文内容正文内容。<strong style="color:#1a6baf;">关键词加粗变色</strong>。正文继续正文继续。
</p>

<!-- 空行呼吸 -->
<p style="margin-bottom:20px;">
第二段正文内容。
</p>

<!-- 金句引用框 -->
<section style="background:#f0f7ff; border-left:4px solid #1a6baf; padding:15px 20px; margin:25px 0; line-height:1.8; font-size:15px; color:#333;">
金句内容放在这里，这是全文最重要的一句话。
</section>

<!-- H3小节标题 -->
<h3 style="color:#2c3e50; font-size:17px; font-weight:bold; margin:25px 0 12px;">
小节标题
</h3>

<!-- 配图 -->
<section style="margin:20px 0;">
<img src="图片URL" style="width:100%; border-radius:8px; display:block;"/>
<p style="text-align:center; font-size:13px; color:#999; margin-top:8px;">▲ 图注文字</p>
</section>

<!-- 列表 -->
<section style="margin:15px 0; padding-left:5px;">
<p style="margin-bottom:10px;">▪️ 列表项第一条</p>
<p style="margin-bottom:10px;">▪️ 列表项第二条</p>
<p style="margin-bottom:10px;">▪️ 列表项第三条</p>
</section>

<!-- 重点提示框 -->
<section style="background:#fff3cd; padding:12px 16px; border-radius:6px; margin:20px 0; font-size:14px; line-height:1.8; color:#856404;">
⚠️ 重点提示内容
</section>

<!-- 分隔线 -->
<p style="text-align:center; color:#ccc; margin:30px 0; letter-spacing:8px;">· · ·</p>

<!-- 数据卡片 -->
<section style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:8px; padding:20px; margin:20px 0; text-align:center;">
<span style="font-size:36px; font-weight:bold; color:#1a6baf;">86%</span><br/>
<span style="font-size:14px; color:#666;">的用户在手机上阅读</span>
</section>

<!-- 步骤项 -->
<section style="margin:15px 0;">
<section style="display:flex; align-items:flex-start; margin-bottom:12px;">
<span style="background:#1a6baf; color:white; min-width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; margin-right:12px;">1</span>
<span style="font-size:15px; line-height:1.8;">第一步内容描述</span>
</section>
<section style="display:flex; align-items:flex-start; margin-bottom:12px;">
<span style="background:#1a6baf; color:white; min-width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; margin-right:12px;">2</span>
<span style="font-size:15px; line-height:1.8;">第二步内容描述</span>
</section>
</section>

<!-- 文末引导 -->
<section style="background:#f8f9fa; border-radius:8px; padding:20px; margin:30px 0; text-align:center; line-height:2;">
<p style="font-size:15px; color:#333;">如果觉得有用，点个<strong style="color:#1a6baf;">「在看」</strong>👇</p>
<p style="font-size:14px; color:#888;">你的支持是我持续创作的动力</p>
</section>

</section>
<!-- ========== 文章结束 ========== -->
```

---

## 配色切换

上方模板使用科技蓝(#1a6baf)，替换以下色值即可切换配色：

```
科技蓝 → 暖橙：#1a6baf → #e67e22，#f0f7ff → #fef9f0
科技蓝 → 极简黑：#1a6baf → #1a1a1a，#f0f7ff → #f8f8f8
科技蓝 → 清新绿：#1a6baf → #27ae60，#f0f7ff → #f0faf4
科技蓝 → 活力紫：#1a6baf → #8e44ad，#f0f7ff → #f8f0fc
科技蓝 → 中国红：#1a6baf → #c0392b，#f0f7ff → #fef5f3
```
