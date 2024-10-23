# Superwerker and Control Tower clean up scripts

### Intro
- AWS Control Tower decomissioning does not remove all resources
- Deleting the superwerker cloudformation does not remove all resources
- If you want to re-deploy Control Tower again after decomissioning you MUST clean up some resources manually, same applies for superwerker
- See official AWS docs: https://docs.aws.amazon.com/controltower/latest/userguide/decommission-landing-zone.html

### Prerequisites
- Login into master account as root and open cloudshell
    - https://console.aws.amazon.com/cloudshell
- create IAM user for clean up
    - copy&paste `create-iam-user.sh` in cloudshell for getting credentials as non root
    - Hint: you can re-run the script as often as you want, its basically idempotent

### Clean up
- run `make` to see all options
- run `make clean-sw` to clean up superwerker installation