# find all python files in the current directory
# and all subdirectories
PYTHON_DIRS := $(shell find ./src/ -name '*requirements.txt' -exec dirname {} \;)


.PHONY: test
test:
	echo $(PYTHON_DIRS)
	$(foreach dir,$(PYTHON_DIRS),$(MAKE) -C $(dir) test;)
