import sys


if __name__ == "__main__":
    if sys.argv[1:2] == ["--conversion-worker"]:
        from app.conversion.worker import main

        del sys.argv[1]
    else:
        from app.desktop_server import main

    raise SystemExit(main())
