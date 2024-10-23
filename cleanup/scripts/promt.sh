#!/bin/bash
LZ_CLEANUP_PROMPT="${LZ_CLEANUP_PROMPT:-true}"
if [[ "$LZ_CLEANUP_PROMPT" = 'true' ]] 
then 
    printf "\n"

    # promt user for yes else exit
    read -p "Do you want to continue? (y/n) " -n 1 -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]
    then
        printf "\n Exiting script "
        exit 1
    else
        printf "\n=================================================== \n"
    fi
fi