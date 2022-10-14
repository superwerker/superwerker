# Technical FAQ

This document aims to provide answers for more technical and deep dive frequently asked questions.

## Why do I need a domain and subdomain

They are only used for the RootMail feature. These values have no relevance for the domains of your final applications and workloads.
In most cases the domain will be `example.com` and the subdomain `aws`.
You must have the possibility to add an `NS` entry for `aws.example.com` in your domain registrar console, otherwise the superwerker installation will not succeed.

## What kind of Notifications are sent to the NotificationMail?

At the moment, those are notifications about new OpsItems. Those OpsItems are created from the RootMail feature. So these notifications are about new created AWS accounts or requested password resets.

In the future there might be more notifications, but nothing planned yet.