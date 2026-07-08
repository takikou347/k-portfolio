---
paths:
  - "src/components/**"
---

# UI コンポーネント規約

- ビジュアルの正は `design/DESIGN.md`。色・タイポグラフィ・質感はすべてそこに従う
- デザイントークンは CSS カスタムプロパティとして `src/styles/tokens.css` に定義。hex 直書き禁止
- UI ライブラリは使わない (このアプリはキャンバスが主役)。ツールバー等は素の React + CSS で作る
- Props 型は `type Props = {...}` としてコンポーネント直上に定義。`interface` は使わない
- アイコンは lucide-react のみ使用
