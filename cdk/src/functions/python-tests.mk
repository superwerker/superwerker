default: test

.PHONY: test
test: export VIRTUAL_ENV=$(VENV)
test: activate test-dependencies
	$(PYTHON) -m pytest ./tests

venv:
	echo $${SHELL}
	-[ ! -d venv ] && python -m virtualenv venv

.PHONY: activate
activate: venv
	$(eval PYTHON=$(shell . venv/bin/activate; which python))
	$(eval VENV := $(shell . venv/bin/activate; echo $$VIRTUAL_ENV))

test-dependencies: activate
	$(PYTHON) -m pip install -r requirements_dev.txt

.PHONY: clean
clean:
	rm -rf venv

