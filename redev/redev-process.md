# Redev Process

`redev/` is the workspace for research and development before a PRD is ready for the board. It is where we build context, collect source material, and develop the documentation needed to define a piece of work properly.

## Main Branches

There are two main branches inside `redev/`:

- `redev/system/`
- `redev/website/`

`system` is for work that applies to the project as a whole. This includes processes, tooling, automation, infrastructure, developer workflows, and any cross-project concern that is not limited to a single page.

`website` is for page-specific work. This is used when research and development is focused on an individual page, route, or page section so we can clearly track where that research is taking place.

## Purpose

The purpose of `redev/` is not to force a fixed set of documents at the start. Its purpose is to create a structured place where context can be built up over time until the work is clear enough to produce a PRD.

In practice, a `redev` folder is the place where we:

- mark when the research and development process started
- store the initiating material for that work
- add supporting documentation as needed
- build toward a PRD when the context is ready

## How a Redev Session Starts

Usually the redev process is kicked off by a screenshot, but it can also start from:

- any other file
- a collection of files
- a written request to start redev in a particular folder

The first input is just the trigger. It does not determine the full documentation set in advance. It simply starts the session and gives the folder its initial context.

## Folder Structure

The folder structure should make two things obvious:

- whether the work belongs to `system` or `website`
- when that specific redev session started

### Website structure

For website work, use the page path and then a timestamped session folder:

```text
redev/website/{page-path}/{YYYY-MM-DD_HHMM}/
```

Examples:

```text
redev/website/stage/roomCode/2026-03-11_2337/
redev/website/stats/me/2026-03-09_1830/
```

### System structure

For system work, use a topic name with the timestamp attached to the session folder:

```text
redev/system/{topic}-{YYYY-MM-DD_HHMM}/
```

Example:

```text
redev/system/pm-checkin-2026-03-11_0300/
```

## What Goes Into a Redev Folder

A redev folder usually contains the starting material, such as a screenshot or another source file, and then grows from there.

Existing examples show that a session may include documents such as:

- critical analysis
- debate documents
- comparison documents
- investigation notes
- README notes
- the PRD

These documents are not created automatically as a fixed package.

What goes into a redev folder is decided case by case. Each session should only contain the documents that are useful for that specific piece of work. Some sessions may need only a small amount of supporting material before a PRD is written. Others may need multiple rounds of analysis, debate, and supporting notes before the PRD is ready.

## Relationship to the PRD Board

`redev/` is the context-building environment. It is where the work is explored and documented before it becomes a formal product requirement.

Once the PRD is created, it moves into the `prd-board/` process for that next stage of review and handling.

Until then, the `redev` folder remains the active workspace for building understanding, collecting evidence, and shaping the work into something ready for a PRD.
