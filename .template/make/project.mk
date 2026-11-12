TEMPLATE_PYTHON := uv run --no-project --python 3.12 python
.PHONY: template-setup setup
template-setup setup:
	$(TEMPLATE_PYTHON) scripts/project.py setup
.PHONY: template-format format
template-format format:
	$(TEMPLATE_PYTHON) scripts/project.py format
.PHONY: template-format-check format-check
template-format-check format-check:
	$(TEMPLATE_PYTHON) scripts/project.py format-check
.PHONY: template-lint lint
template-lint lint:
	$(TEMPLATE_PYTHON) scripts/project.py lint
.PHONY: template-typecheck typecheck
template-typecheck typecheck:
	$(TEMPLATE_PYTHON) scripts/project.py typecheck
.PHONY: template-test test
template-test test:
	$(TEMPLATE_PYTHON) scripts/project.py test
.PHONY: template-check check
template-check check:
	$(TEMPLATE_PYTHON) scripts/project.py check
.PHONY: template-build build
template-build build:
	$(TEMPLATE_PYTHON) scripts/project.py build
.PHONY: template-docs-build docs-build
template-docs-build docs-build:
	$(TEMPLATE_PYTHON) scripts/project.py docs-build
