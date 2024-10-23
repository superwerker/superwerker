# Makefile
SHELL := /bin/bash

.DEFAULT_GOAL := help

# PHONY
.PHONY: help

# Directories
SRC_DIR := scripts

# Self Documenting Makefile
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

clean-sw-new: ## ----- Superwerker >1.0 -----

clean-sw: ## Clean up all resources
	$(SRC_DIR)/cleanup-superwerker.sh

clean-additional: ## ------- Additional Scripts --------

clean-lza: ## LZA: clean up all resources
	$(SRC_DIR)/cleanup-lza.sh

creds: chmod ## Check credentials
	$(SRC_DIR)/check-credentials.sh

chmod: ## Make scripts executable
	chmod +x $(SRC_DIR)/*.sh
