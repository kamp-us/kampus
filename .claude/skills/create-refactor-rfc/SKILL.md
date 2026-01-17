---
name: create-refactor-rfc
description: Use this skill to create an RFC for a refactor.
---

This skill will be invoked when the user wants to create an RFC for a refactor. Follow the steps below:

1. Ask the user for a long, detailed description of the problem they want to solve and any potential ideas for solutions.

2. Explore the repo to understand the current state of the codebase and in what ways the codebase violates the values.

3. Interview the user about changes they would like to see made. Be extremely detailed and thorough.

4. Create a RFC for the changes that will be made. The RFC should be structured like so:

<rfc-template>

## Problem Statement

The problem that the developer is facing, from the developer's perspective. This should be readable by a newcomer to the project.

## Solution

The solution to the problem, from the developer's perspective.

## Implementation

This section should explain the rough API changes (internal and external), package changes, etc. The goal is to give an idea to reviews about the subsystems that require change and the surface area of those changes.

## Definition of Done

A numbered list of criteria that must be met for the refactor to be considered complete.

<criterion-example>
1. All modals have been moved inside a modals directory.
</criterion-example>

This will be used to break the RFC into smaller chunks.

</rfc-template>

5. Submit the RFC as a GitHub issue.
