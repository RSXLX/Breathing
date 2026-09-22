# 3D 创作 brief 与提示词

用途：帮助生成/制作三类统一风格的城市生命体。以下是建议提示词，不是已执行的 API 请求，也不保证输出拓扑、压缩格式或材质支持。实际接口配置与格式验收以原项目 `docs/PROVIDERS.md` 为准。

## 统一约束

轮廓柔软而清晰、少材质、无文字、无品牌、静态结构、可用运行时缩放表现呼吸。不要添加内部电子器件，不要求模型自带骨骼动画。以“真实城市仍可辨认”为目标，不用复杂细节填满画面。

### 树冠种荚 / Tree seedpod

```text
A single softly rounded seedpod-like urban spirit for a calming city art experience. Organic layered shell, gentle asymmetry, clear compact silhouette, no face, no text, no logo, no background, no base. A clean static low-complexity 3D object, few materials, designed to look good at a small size when placed near a tree canopy. Soft pearl-like surface with restrained luminous accents. No rigging or animation required.
```

### 建筑呼吸膜 / Architectural breathing membrane

```text
A single abstract soft membrane sculpture inspired by a building exhaling. Shallow curved volume with a clean rounded perimeter and subtle flowing folds. Minimal, calm, modern, no building model, no windows, no text, no logo, no background. A lightweight static object with few materials and a strong readable silhouette, suitable for overlaying a building region in a camera composition. No rigging required.
```

### 云状生命体 / Cloud organism

```text
A single floating organism halfway between a cloud and a jellyfish, without a face. Rounded cloud-like core, a few broad soft lobes, short simple trailing shapes, calm organic silhouette. No scene, no ocean, no text, no logo. Low-complexity static geometry with few materials, readable against a real sky, suitable for slow breathing scale changes at runtime. No rigging required.
```

## 交付与验收

每件资产附：名称、作者/生成服务、真实 task ID（适用时）、输出日期、原始文件、最终 GLB、面数、材质数、压缩说明、预览和授权备注。

在项目里完成“导入 → 旋转观察 → 应用到画面 → 录制”的连续验证。材质不兼容时先调整导出或查看器，不把预览渲染图当作运行结果。
