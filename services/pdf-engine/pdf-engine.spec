# The final binary TOC is normalized before PyInstaller creates PKG/EXE.
from pathlib import Path
import sys

root = Path(SPEC).resolve().parents[2]
engine = root / "services/pdf-engine"
sys.path[:0] = [str(root), str(engine)]
from PyInstaller.utils.hooks import collect_submodules
from scripts.windows_crt import normalize

a = Analysis(
    [str(engine / "desktop_entrypoint.py")],
    pathex=[str(engine)], binaries=[],
    datas=[(str(engine / "build/ocr"), "ocr"), (str(root / "apps/web/public/fonts"), "fonts")],
    hiddenimports=collect_submodules("app"), hookspath=[], hooksconfig={},
    runtime_hooks=[], excludes=[], noarchive=False, optimize=0,
)
a.binaries = normalize(a.binaries)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name="pdf-engine",
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
          runtime_tmpdir=None, console=True, disable_windowed_traceback=False,
          argv_emulation=False, target_arch=None, codesign_identity=None, entitlements_file=None)
