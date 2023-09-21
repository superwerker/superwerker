# find all python files in the current directory
# and all subdirectories
PYTHON_DIRS := $(shell find ./src/ -name '*requirements.txt' -exec dirname {} \;)


.PHONY: test
test:
	# yarn jest --silent
	echo $(PYTHON_DIRS)
	$(foreach dir,$(PYTHON_DIRS),$(MAKE) -C $(dir) test;)
	$(foreach dir,$(PYTHON_DIRS),rm -rf $(dir)/venv;)
