"""Check relative links and GitHub-style Markdown anchors in tracked docs."""

import re
import subprocess
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
LINK = re.compile(r"\]\(\s*(?:<([^>]+)>|([^\s)]+))")
REFERENCE = re.compile(r"^ {0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))")
HEADING = re.compile(r"^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$")
ANCHOR = re.compile(r"""\b(?:id|name)=["']([^"']+)["']""")


def markdown_lines(path):
    fence = None
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        match = FENCE.match(line)
        if match:
            sign = match[1]
            if fence is None:
                fence = sign
            elif sign[0] == fence[0] and len(sign) >= len(fence):
                fence = None
        elif fence is None:
            yield number, line


def anchors(path):
    counts = Counter()
    found = set()
    for _, line in markdown_lines(path):
        found.update(ANCHOR.findall(line))
        heading = HEADING.match(line)
        if heading:
            value = re.sub(r"[^\w\s-]", "", heading[1].lower())
            slug = value.replace(" ", "-")
            suffix = counts[slug]
            counts[slug] += 1
            found.add(f"{slug}-{suffix}" if suffix else slug)
    return found


def main():
    files = subprocess.check_output(
        ["git", "ls-files", "-z", "--", "*.md"], cwd=ROOT,
    ).decode().strip("\0").split("\0")
    checked = 0
    evidence = 0
    broken = []
    cache = {}
    for name in files:
        source = ROOT / name
        for number, line in markdown_lines(source):
            matches = list(LINK.finditer(line)) + list(REFERENCE.finditer(line))
            for match in matches:
                raw = match[1] or match[2]
                dest = urlsplit(raw)
                if dest.scheme or dest.netloc:
                    continue
                target = (source.parent / unquote(dest.path)).resolve() if dest.path else source
                if target.is_relative_to(ROOT / "data/output"):
                    evidence += 1
                    continue
                checked += 1
                if not target.is_relative_to(ROOT) or not target.exists():
                    broken.append(f"{name}:{number}: missing {raw}")
                elif dest.fragment and target.suffix.lower() == ".md":
                    if target not in cache:
                        cache[target] = anchors(target)
                    if unquote(dest.fragment) not in cache[target]:
                        broken.append(f"{name}:{number}: unknown anchor {raw}")
    for error in broken:
        print(error)
    print(f"{checked} internal links checked, {len(broken)} broken, {evidence} local evidence links exempt.")
    return bool(broken)


if __name__ == "__main__":
    raise SystemExit(main())
