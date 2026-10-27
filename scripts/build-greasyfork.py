#!/usr/bin/env python3
"""生成 Greasy Fork 发布版。

油叉自己托管脚本更新，发布到油叉的版本不应带指向 GitHub 的
@updateURL / @downloadURL；其余代码与主文件完全一致。
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "zhihu-word-mode.user.js"
TARGET = ROOT / "dist" / "zhihu-word-mode.greasyfork.user.js"
SKIP_PREFIXES = ("// @updateURL", "// @downloadURL")


def main() -> None:
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    kept = [line for line in lines if not line.startswith(SKIP_PREFIXES)]
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text("\n".join(kept) + "\n", encoding="utf-8")
    print(f"wrote {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
