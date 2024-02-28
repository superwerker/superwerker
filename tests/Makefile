default: test

.PHONY: test
test: export VIRTUAL_ENV=$(VENV)
test: activate test-dependencies
	$(PYTHON) -m pytest -v --junit-xml=test-results.xml .

venv:
	echo $${SHELL}
	python3 -m pip install -qqq virtualenv
	-[ ! -d venv ] && python3 -m virtualenv venv > /dev/null

.PHONY: activate
activate: venv
	$(eval PYTHON=$(shell . venv/bin/activate; which python))
	$(eval VENV := $(shell . venv/bin/activate; echo $$VIRTUAL_ENV))

test-dependencies: activate
	$(PYTHON) -m pip install -qqq -r requirements.txt

.PHONY: clean
clean:
	rm -rf venv

